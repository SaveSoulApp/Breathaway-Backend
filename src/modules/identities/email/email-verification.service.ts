import { randomInt } from 'crypto';

import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityType } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { normalizeIdentityValue } from '@common/utils/identity.utils';
import { BaseService } from '@core/base';
import { CryptoUtils, hashString } from '@core/crypto/crypto.utils';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { RedisService } from '@infrastructure/redis';
import { AuditActionType } from '@modules/audit/dto';
import { IdentityAlreadyExistsException } from '@modules/identities/application/exceptions';
import { IdentityResponseDto } from '@modules/identities/dto';
import {
  EMAIL_VERIFICATION_REQUESTED_EVENT,
  EmailVerificationRequestedEvent,
  IDENTITY_ADDED_EVENT,
  IdentityAddedEvent,
} from '@modules/identities/events';
import { IdentitiesService } from '@modules/identities/identities.service';
import {
  InvalidOtpException,
  OtpRateLimitExceededException,
} from '@modules/one-time-passwords/application/exceptions';

import {
  SendEmailOtpRequestDto,
  SendEmailOtpResponseDto,
  VerifyEmailOtpRequestDto,
} from './dto';

/**
 * Manages the full lifecycle of email verification OTPs and identity linking.
 *
 * Enforces multi-tier rate limiting (cooldowns, hourly caps), stores hashed OTPs
 * in Redis, and delegates successful verifications to IdentitiesService for
 * atomic persistence, encryption, and deferred like resolution.
 */
@Injectable()
export class EmailVerificationService extends BaseService {
  private static readonly EMAIL_OTP_TTL_SECONDS = 600; // 10 minutes
  private static readonly EMAIL_OTP_COOLDOWN_SECONDS = 60; // 1 minute
  private static readonly EMAIL_OTP_HOURLY_LIMIT = 5; // max 5 requests per hour
  private static readonly EMAIL_OTP_MAX_ATTEMPTS = 5; // max 5 invalid attempts before burning

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly encryption: IdentityCryptoService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => IdentitiesService))
    private readonly identitiesService: IdentitiesService,
  ) {
    super(logger);
  }

  // ----- Redis Key Helpers -----

  private getEmailOtpRedisKey(userId: string, emailHex: string): string {
    return `email_verification_otp:${userId}:${emailHex}`;
  }

  private getEmailOtpUserCooldownKey(userId: string): string {
    return `rate_limit:email_otp:user:${userId}`;
  }

  private getEmailOtpEmailCooldownKey(emailHex: string): string {
    return `rate_limit:email_otp:email:${emailHex}`;
  }

  private getEmailOtpHourlyKey(userId: string): string {
    return `rate_limit:email_otp:hourly:${userId}`;
  }

  private getEmailOtpEmailHourlyKey(emailHex: string): string {
    return `rate_limit:email_otp:hourly:email:${emailHex}`;
  }

  private isActivelyOwned(identity: {
    userId: string | null;
    isVerified: boolean;
  }): boolean {
    return identity.userId !== null && identity.isVerified;
  }

  /**
   * Generates and dispatches a 6-digit verification code to the target email address.
   *
   * Verifies that the email is not already claimed by another user or verified by the caller.
   * Enforces multi-tier rate limiting (per-user cooldown, per-email cooldown, and hourly limit).
   * Emits `EmailVerificationRequestedEvent` for decoupled Brevo email dispatch.
   *
   * @param userId - ID of the authenticated user requesting verification.
   * @param dto - Container for the email address to verify.
   * @returns Expiration and resend cooldown durations.
   * @throws {ConflictException} When the email is already linked to the caller's account.
   * @throws {IdentityAlreadyExistsException} When the email is already actively owned by another user.
   * @throws {OtpRateLimitExceededException} When user/email cooldown or hourly cap is exceeded.
   */
  async sendEmailOtp(
    userId: string,
    dto: SendEmailOtpRequestDto,
  ): Promise<SendEmailOtpResponseDto> {
    const normalizedEmail = normalizeIdentityValue(
      dto.email,
      IdentityType.EMAIL,
    );
    const publicValueData = await this.encryption.processPublicValue(
      normalizedEmail,
      IdentityType.EMAIL,
    );
    const emailHex = CryptoUtils.toHex(publicValueData.publicValueHash);
    const ctx = { userId, identityType: IdentityType.EMAIL, emailHex };

    this.logger.log('Email OTP verification initiated', {
      ...ctx,
      step: 'init',
      maskedValue: publicValueData.publicValueMasked,
    });

    // 1. Ownership & Duplicate Pre-flight Check
    const existing = await this.prisma.identity.findFirst({
      where: {
        type: IdentityType.EMAIL,
        publicValueHash: publicValueData.publicValueHash,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        isVerified: true,
      },
    });

    if (existing && this.isActivelyOwned(existing)) {
      if (existing.userId === userId) {
        this.logger.warn(
          'Email OTP request aborted: already verified by caller',
          {
            ...ctx,
            step: 'ownership_check',
          },
        );
        throw new ConflictException(
          'This email is already verified and linked to your account',
        );
      }
      this.logger.warn(
        'Email OTP request aborted: already actively owned by another user',
        {
          ...ctx,
          existingUserId: existing.userId,
          step: 'ownership_check',
        },
      );
      throw new IdentityAlreadyExistsException();
    }

    // 2. Multi-tier Rate Limiting Checks
    const userCooldownKey = this.getEmailOtpUserCooldownKey(userId);
    const isUserCooldown = await this.redisService.get(userCooldownKey);
    if (isUserCooldown) {
      this.logger.warn('Email OTP request throttled: user cooldown active', {
        ...ctx,
        step: 'rate_limit_user',
      });
      throw new OtpRateLimitExceededException(
        'Please wait 60 seconds before requesting another verification code.',
      );
    }

    const emailCooldownKey = this.getEmailOtpEmailCooldownKey(emailHex);
    const isEmailCooldown = await this.redisService.get(emailCooldownKey);
    if (isEmailCooldown) {
      this.logger.warn('Email OTP request throttled: email cooldown active', {
        ...ctx,
        step: 'rate_limit_email',
      });
      throw new OtpRateLimitExceededException(
        'A verification code was recently sent to this email. Please wait 60 seconds.',
      );
    }

    const hourlyKey = this.getEmailOtpHourlyKey(userId);
    const hourlyCountStr = await this.redisService.get(hourlyKey);
    const hourlyCount = hourlyCountStr ? parseInt(hourlyCountStr, 10) : 0;
    if (hourlyCount >= EmailVerificationService.EMAIL_OTP_HOURLY_LIMIT) {
      this.logger.warn('Email OTP request throttled: hourly limit exceeded', {
        ...ctx,
        hourlyCount,
        step: 'rate_limit_hourly',
      });
      throw new OtpRateLimitExceededException(
        'You have exceeded the maximum email verification attempts for this hour. Please try again later.',
      );
    }

    const emailHourlyKey = this.getEmailOtpEmailHourlyKey(emailHex);
    const emailHourlyCountStr = await this.redisService.get(emailHourlyKey);
    const emailHourlyCount = emailHourlyCountStr
      ? parseInt(emailHourlyCountStr, 10)
      : 0;
    if (emailHourlyCount >= EmailVerificationService.EMAIL_OTP_HOURLY_LIMIT) {
      this.logger.warn(
        'Email OTP request throttled: email hourly limit exceeded',
        {
          ...ctx,
          emailHourlyCount,
          step: 'rate_limit_email_hourly',
        },
      );
      throw new OtpRateLimitExceededException(
        'This email address has exceeded the maximum verification attempts for this hour. Please try again later.',
      );
    }

    // 3. Generate Cryptographically Secure 6-digit OTP
    const plainOtp = randomInt(100000, 1000000).toString();
    const hashedOtp = hashString(plainOtp);

    // 4. Store State in Redis
    const redisKey = this.getEmailOtpRedisKey(userId, emailHex);
    const otpPayload = JSON.stringify({
      otpHash: hashedOtp,
      userId,
      email: normalizedEmail,
      attempts: 0,
      maxAttempts: EmailVerificationService.EMAIL_OTP_MAX_ATTEMPTS,
    });

    try {
      await this.redisService.set(
        redisKey,
        otpPayload,
        'EX',
        EmailVerificationService.EMAIL_OTP_TTL_SECONDS,
      );

      // Set cooldown sentinels and advance hourly counter
      await this.redisService.set(
        userCooldownKey,
        '1',
        'EX',
        EmailVerificationService.EMAIL_OTP_COOLDOWN_SECONDS,
      );
      await this.redisService.set(
        emailCooldownKey,
        '1',
        'EX',
        EmailVerificationService.EMAIL_OTP_COOLDOWN_SECONDS,
      );

      if (hourlyCount === 0) {
        await this.redisService.set(hourlyKey, '1', 'EX', 3600);
      } else {
        await this.redisService.incr(hourlyKey);
        const ttl = await this.redisService.ttl(hourlyKey);
        if (ttl === -1) {
          await this.redisService.expire(hourlyKey, 3600);
        }
      }

      if (emailHourlyCount === 0) {
        await this.redisService.set(emailHourlyKey, '1', 'EX', 3600);
      } else {
        await this.redisService.incr(emailHourlyKey);
        const emailTtl = await this.redisService.ttl(emailHourlyKey);
        if (emailTtl === -1) {
          await this.redisService.expire(emailHourlyKey, 3600);
        }
      }

      this.logger.debug('Stored email verification OTP in Redis', {
        ...ctx,
        step: 'persist_otp',
        otpTtl: EmailVerificationService.EMAIL_OTP_TTL_SECONDS,
      });
    } catch (error) {
      this.logger.error('Failed to store email OTP in Redis', {
        ...ctx,
        step: 'persist_otp',
        err: serializeError(error),
      });
      throw error;
    }

    // 5. Emit Audit Log & Structured Event
    this.emitAuditLog({
      actionType: AuditActionType.IDENTITY_OTP_SENT,
      userId,
      metadata: {
        identityType: IdentityType.EMAIL,
        maskedValue: publicValueData.publicValueMasked,
        publicValueHash: emailHex,
      },
    });

    this.logger.event(LOG_EVENT.OTP_SENT, {
      userId,
      identityType: IdentityType.EMAIL,
    });

    // 6. Emit Domain Event for Decoupled Brevo Dispatch
    this.eventEmitter.emit(
      EMAIL_VERIFICATION_REQUESTED_EVENT,
      new EmailVerificationRequestedEvent(
        userId,
        normalizedEmail,
        plainOtp,
        EmailVerificationService.EMAIL_OTP_TTL_SECONDS,
      ),
    );

    return {
      message: 'Verification code sent to email',
      expiresIn: EmailVerificationService.EMAIL_OTP_TTL_SECONDS,
      resendAfter: EmailVerificationService.EMAIL_OTP_COOLDOWN_SECONDS,
    };
  }

  /**
   * Validates a 6-digit email OTP and links the verified email identity to the user account.
   *
   * Atomically consumes the OTP upon match, burns the token after 5 failed attempts,
   * encrypts and claims the Identity in PostgreSQL via IdentitiesService, and emits security notifications.
   *
   * @param userId - ID of the authenticated user verifying the code.
   * @param dto - Container for the email address and 6-digit OTP code.
   * @returns Masked representation of the newly verified identity.
   * @throws {InvalidOtpException} When OTP is expired, invalid, or max attempts exceeded.
   */
  async verifyEmailOtp(
    userId: string,
    dto: VerifyEmailOtpRequestDto,
  ): Promise<IdentityResponseDto> {
    const normalizedEmail = normalizeIdentityValue(
      dto.email,
      IdentityType.EMAIL,
    );
    const publicValueData = await this.encryption.processPublicValue(
      normalizedEmail,
      IdentityType.EMAIL,
    );
    const emailHex = CryptoUtils.toHex(publicValueData.publicValueHash);
    const ctx = { userId, identityType: IdentityType.EMAIL, emailHex };

    this.logger.log('Email OTP verification attempt started', {
      ...ctx,
      step: 'init',
      maskedValue: publicValueData.publicValueMasked,
    });

    const redisKey = this.getEmailOtpRedisKey(userId, emailHex);
    let rawData: string | null = null;

    try {
      rawData = await this.redisService.get(redisKey);
    } catch (error) {
      this.logger.error('Failed to read email OTP from Redis', {
        ...ctx,
        step: 'fetch_otp',
        err: serializeError(error),
      });
      throw error;
    }

    if (!rawData) {
      this.logger.warn(
        'Email OTP verification failed: code expired or missing',
        {
          ...ctx,
          step: 'verify_lookup',
        },
      );
      this.logger.event(LOG_EVENT.OTP_VERIFICATION_FAILED, {
        userId,
        identityType: IdentityType.EMAIL,
      });
      throw new InvalidOtpException(
        'Verification code has expired or is invalid',
      );
    }

    interface StoredOtpRecord {
      otpHash: string;
      userId: string;
      email: string;
      attempts: number;
      maxAttempts: number;
    }
    const parsedData = JSON.parse(rawData) as StoredOtpRecord;

    // Guard against max attempts already reached
    if (parsedData.attempts >= parsedData.maxAttempts) {
      await this.redisService.del(redisKey);
      this.logger.warn(
        'Email OTP verification failed: max attempts reached; burned key',
        {
          ...ctx,
          attempts: parsedData.attempts,
          step: 'burn_otp_limit',
        },
      );
      this.logger.event(LOG_EVENT.OTP_VERIFICATION_FAILED, {
        userId,
        identityType: IdentityType.EMAIL,
      });
      throw new InvalidOtpException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // Hash the input OTP and compare in constant-time
    const inputHash = hashString(dto.otp);
    const isMatch = CryptoUtils.constantTimeEquals(
      Buffer.from(inputHash, 'utf-8'),
      Buffer.from(parsedData.otpHash, 'utf-8'),
    );

    if (!isMatch) {
      parsedData.attempts += 1;
      const remainingAttempts = parsedData.maxAttempts - parsedData.attempts;

      if (remainingAttempts <= 0) {
        await this.redisService.del(redisKey);
        this.logger.warn('Email OTP burned: exceeded allowed attempts', {
          ...ctx,
          step: 'burn_otp',
        });
        this.logger.event(LOG_EVENT.OTP_VERIFICATION_FAILED, {
          userId,
          identityType: IdentityType.EMAIL,
        });
        throw new InvalidOtpException(
          'Maximum verification attempts exceeded. Please request a new code.',
        );
      }

      // Update attempts in Redis preserving remaining TTL
      const remainingTtl = await this.redisService.ttl(redisKey);
      if (remainingTtl <= 0) {
        await this.redisService.del(redisKey);
        this.logger.warn('Email OTP expired during verification attempt', {
          ...ctx,
          step: 'verify_expired',
        });
        this.logger.event(LOG_EVENT.OTP_VERIFICATION_FAILED, {
          userId,
          identityType: IdentityType.EMAIL,
        });
        throw new InvalidOtpException(
          'Verification code has expired or is invalid',
        );
      }

      await this.redisService.set(
        redisKey,
        JSON.stringify(parsedData),
        'EX',
        remainingTtl,
      );

      this.logger.warn('Email OTP verification failed: incorrect code', {
        ...ctx,
        attempts: parsedData.attempts,
        remainingAttempts,
        step: 'verify_mismatch',
      });
      this.logger.event(LOG_EVENT.OTP_VERIFICATION_FAILED, {
        userId,
        identityType: IdentityType.EMAIL,
      });
      throw new InvalidOtpException(
        `Invalid verification code. ${remainingAttempts} ${
          remainingAttempts === 1 ? 'attempt' : 'attempts'
        } remaining.`,
      );
    }

    // OTP is valid — consume immediately from Redis
    try {
      await this.redisService.del(redisKey);
      this.logger.debug('Consumed email OTP from Redis', {
        ...ctx,
        step: 'consume_otp',
      });
    } catch (error) {
      this.logger.error('Failed to consume email OTP in Redis', {
        ...ctx,
        step: 'consume_otp',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.event(LOG_EVENT.OTP_VERIFIED, {
      userId,
      identityType: IdentityType.EMAIL,
    });

    // Claim or create the verified identity in PostgreSQL via IdentitiesService
    const claimedIdentity = await this.identitiesService.claimOrCreateIdentity(
      IdentityType.EMAIL,
      normalizedEmail,
      undefined,
      userId,
    );

    // Emit domain event for security alert dispatch (notifying user across other channels)
    this.eventEmitter.emit(
      IDENTITY_ADDED_EVENT,
      new IdentityAddedEvent(
        userId,
        claimedIdentity.type,
        claimedIdentity.publicValueMasked ?? '',
        claimedIdentity.isVerified,
      ),
    );

    return claimedIdentity;
  }
}

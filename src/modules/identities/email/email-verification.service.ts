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
 * Redis Lua script KEYS index mappings for email OTP rate limiting & storage.
 * Lua arrays are 1-indexed.
 */
export const EMAIL_OTP_LUA_KEY_INDICES = {
  USER_COOLDOWN: 1,
  EMAIL_COOLDOWN: 2,
  USER_HOURLY: 3,
  EMAIL_HOURLY: 4,
  OTP_STORAGE: 5,
} as const;

/**
 * Redis Lua script ARGV index mappings for email OTP rate limiting & storage.
 * Lua arrays are 1-indexed.
 */
export const EMAIL_OTP_LUA_ARGV_INDICES = {
  COOLDOWN_TTL: 1,
  HOURLY_LIMIT: 2,
  HOURLY_WINDOW: 3,
  OTP_PAYLOAD: 4,
  OTP_TTL: 5,
} as const;

/**
 * Rejection reason identifiers returned by the atomic email OTP rate limiter.
 */
export type EmailOtpRateLimitRejectionReason =
  | 'USER_COOLDOWN'
  | 'EMAIL_COOLDOWN'
  | 'USER_HOURLY_LIMIT'
  | 'EMAIL_HOURLY_LIMIT';

/**
 * Strongly typed tuple return shape from the atomic Redis Lua evaluation:
 * - [0]: Status number (1 = allowed & committed, 0 = throttled/rejected)
 * - [1]: Rejection reason or confirmation status ('OK' | EmailOtpRateLimitRejectionReason)
 * - [2]: Optional current hourly count as a string when hourly quota is exceeded
 */
export type EmailOtpRateLimitLuaTuple = [
  status: number,
  reason: string,
  count?: string,
];

/**
 * Evaluated domain outcome for multi-tier email OTP rate limits.
 */
export interface EmailOtpRateLimitResult {
  allowed: boolean;
  reason?: EmailOtpRateLimitRejectionReason;
  count?: number;
}

/**
 * Redis Lua script executing multi-tier email OTP rate limit verification and storage atomically.
 *
 * All KEYS and ARGV access is bound to canonical named index constants to guard against
 * positional parameter drift and off-by-one indexing errors.
 */
const EMAIL_OTP_RATE_LIMIT_LUA_SCRIPT = `
  local userCooldownKey = KEYS[${EMAIL_OTP_LUA_KEY_INDICES.USER_COOLDOWN}]
  local emailCooldownKey = KEYS[${EMAIL_OTP_LUA_KEY_INDICES.EMAIL_COOLDOWN}]
  local userHourlyKey = KEYS[${EMAIL_OTP_LUA_KEY_INDICES.USER_HOURLY}]
  local emailHourlyKey = KEYS[${EMAIL_OTP_LUA_KEY_INDICES.EMAIL_HOURLY}]
  local otpKey = KEYS[${EMAIL_OTP_LUA_KEY_INDICES.OTP_STORAGE}]

  local cooldownTtl = tonumber(ARGV[${EMAIL_OTP_LUA_ARGV_INDICES.COOLDOWN_TTL}])
  local hourlyLimit = tonumber(ARGV[${EMAIL_OTP_LUA_ARGV_INDICES.HOURLY_LIMIT}])
  local hourlyWindow = tonumber(ARGV[${EMAIL_OTP_LUA_ARGV_INDICES.HOURLY_WINDOW}])
  local otpPayload = ARGV[${EMAIL_OTP_LUA_ARGV_INDICES.OTP_PAYLOAD}]
  local otpTtl = tonumber(ARGV[${EMAIL_OTP_LUA_ARGV_INDICES.OTP_TTL}])

  -- 1. Check User Cooldown Sentinel
  if redis.call('EXISTS', userCooldownKey) == 1 then
    return { 0, 'USER_COOLDOWN' }
  end

  -- 2. Check Email Cooldown Sentinel
  if redis.call('EXISTS', emailCooldownKey) == 1 then
    return { 0, 'EMAIL_COOLDOWN' }
  end

  -- 3. Check User Hourly Limit
  local userHourly = tonumber(redis.call('GET', userHourlyKey) or '0')
  if userHourly >= hourlyLimit then
    return { 0, 'USER_HOURLY_LIMIT', tostring(userHourly) }
  end

  -- 4. Check Email Hourly Limit
  local emailHourly = tonumber(redis.call('GET', emailHourlyKey) or '0')
  if emailHourly >= hourlyLimit then
    return { 0, 'EMAIL_HOURLY_LIMIT', tostring(emailHourly) }
  end

  -- 5. Atomically commit sentinels, counters, and OTP payload:
  redis.call('SET', userCooldownKey, '1', 'EX', cooldownTtl)
  redis.call('SET', emailCooldownKey, '1', 'EX', cooldownTtl)

  local newUserHourly = redis.call('INCR', userHourlyKey)
  if newUserHourly == 1 or redis.call('TTL', userHourlyKey) == -1 then
    redis.call('EXPIRE', userHourlyKey, hourlyWindow)
  end

  local newEmailHourly = redis.call('INCR', emailHourlyKey)
  if newEmailHourly == 1 or redis.call('TTL', emailHourlyKey) == -1 then
    redis.call('EXPIRE', emailHourlyKey, hourlyWindow)
  end

  redis.call('SET', otpKey, otpPayload, 'EX', otpTtl)

  return { 1, 'OK' }
`;

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
  private static readonly EMAIL_OTP_HOURLY_WINDOW_SECONDS = 3600; // 1 hour
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

  /**
   * Atomically evaluates multi-tier rate limits (user/email cooldowns and hourly caps)
   * and persists the OTP payload in Redis via a single Lua script evaluation.
   */
  private async evaluateRateLimitAndStoreOtp(
    userId: string,
    emailHex: string,
    otpKey: string,
    otpPayload: string,
  ): Promise<EmailOtpRateLimitResult> {
    const userCooldownKey = this.getEmailOtpUserCooldownKey(userId);
    const emailCooldownKey = this.getEmailOtpEmailCooldownKey(emailHex);
    const userHourlyKey = this.getEmailOtpHourlyKey(userId);
    const emailHourlyKey = this.getEmailOtpEmailHourlyKey(emailHex);

    const keys: string[] = [];
    keys[EMAIL_OTP_LUA_KEY_INDICES.USER_COOLDOWN - 1] = userCooldownKey;
    keys[EMAIL_OTP_LUA_KEY_INDICES.EMAIL_COOLDOWN - 1] = emailCooldownKey;
    keys[EMAIL_OTP_LUA_KEY_INDICES.USER_HOURLY - 1] = userHourlyKey;
    keys[EMAIL_OTP_LUA_KEY_INDICES.EMAIL_HOURLY - 1] = emailHourlyKey;
    keys[EMAIL_OTP_LUA_KEY_INDICES.OTP_STORAGE - 1] = otpKey;

    const args: (string | number)[] = [];
    args[EMAIL_OTP_LUA_ARGV_INDICES.COOLDOWN_TTL - 1] =
      EmailVerificationService.EMAIL_OTP_COOLDOWN_SECONDS;
    args[EMAIL_OTP_LUA_ARGV_INDICES.HOURLY_LIMIT - 1] =
      EmailVerificationService.EMAIL_OTP_HOURLY_LIMIT;
    args[EMAIL_OTP_LUA_ARGV_INDICES.HOURLY_WINDOW - 1] =
      EmailVerificationService.EMAIL_OTP_HOURLY_WINDOW_SECONDS;
    args[EMAIL_OTP_LUA_ARGV_INDICES.OTP_PAYLOAD - 1] = otpPayload;
    args[EMAIL_OTP_LUA_ARGV_INDICES.OTP_TTL - 1] =
      EmailVerificationService.EMAIL_OTP_TTL_SECONDS;

    const result = await this.redisService.eval<EmailOtpRateLimitLuaTuple>(
      EMAIL_OTP_RATE_LIMIT_LUA_SCRIPT,
      keys,
      args,
    );

    if (!result) {
      return { allowed: false };
    }

    const [status, reason, countStr] = result;
    if (status === 1) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: reason as EmailOtpRateLimitRejectionReason,
      count: countStr ? parseInt(countStr, 10) : undefined,
    };
  }

  /**
   * Generates and dispatches a 6-digit verification code to the target email address.
   *
   * Checks only whether the email is already verified on the caller's own account to prevent
   * account enumeration (never leaks whether another user owns the email). Enforces multi-tier
   * rate limiting (per-user cooldown, per-email cooldown, and hourly limit) and persists the
   * OTP payload in a single atomic Redis Lua transaction.
   * Emits `EmailVerificationRequestedEvent` for decoupled email dispatch.
   *
   * @param userId - ID of the authenticated user requesting verification.
   * @param dto - Container for the email address to verify.
   * @returns Expiration and resend cooldown durations.
   * @throws {ConflictException} When the email is already linked to the caller's account.
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

    // 1. Caller Self-Duplicate Pre-flight Check
    // Scoped strictly to the caller's userId so we never disclose whether another
    // user already owns this email address (prevents account enumeration).
    const existingOwnIdentity = await this.prisma.identity.findFirst({
      where: {
        type: IdentityType.EMAIL,
        publicValueHash: publicValueData.publicValueHash,
        userId,
        isVerified: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (existingOwnIdentity) {
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

    // 2. Generate Cryptographically Secure 6-digit OTP & Payload
    const plainOtp = randomInt(100000, 1000000).toString();
    const hashedOtp = hashString(plainOtp);
    const redisKey = this.getEmailOtpRedisKey(userId, emailHex);
    const otpPayload = JSON.stringify({
      otpHash: hashedOtp,
      userId,
      email: normalizedEmail,
      attempts: 0,
      maxAttempts: EmailVerificationService.EMAIL_OTP_MAX_ATTEMPTS,
    });

    // 3. Atomically Evaluate Multi-Tier Rate Limits & Store OTP Payload in Redis
    const rateLimitResult = await this.evaluateRateLimitAndStoreOtp(
      userId,
      emailHex,
      redisKey,
      otpPayload,
    );

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === 'USER_COOLDOWN') {
        this.logger.warn('Email OTP request throttled: user cooldown active', {
          ...ctx,
          step: 'rate_limit_user',
        });
        throw new OtpRateLimitExceededException(
          'Please wait 60 seconds before requesting another verification code.',
        );
      }

      if (rateLimitResult.reason === 'EMAIL_COOLDOWN') {
        this.logger.warn('Email OTP request throttled: email cooldown active', {
          ...ctx,
          step: 'rate_limit_email',
        });
        throw new OtpRateLimitExceededException(
          'A verification code was recently sent to this email. Please wait 60 seconds.',
        );
      }

      if (rateLimitResult.reason === 'USER_HOURLY_LIMIT') {
        this.logger.warn('Email OTP request throttled: hourly limit exceeded', {
          ...ctx,
          hourlyCount: rateLimitResult.count,
          step: 'rate_limit_hourly',
        });
        throw new OtpRateLimitExceededException(
          'You have exceeded the maximum email verification attempts for this hour. Please try again later.',
        );
      }

      if (rateLimitResult.reason === 'EMAIL_HOURLY_LIMIT') {
        this.logger.warn(
          'Email OTP request throttled: email hourly limit exceeded',
          {
            ...ctx,
            emailHourlyCount: rateLimitResult.count,
            step: 'rate_limit_email_hourly',
          },
        );
        throw new OtpRateLimitExceededException(
          'This email address has exceeded the maximum verification attempts for this hour. Please try again later.',
        );
      }

      this.logger.warn('Email OTP request throttled by rate limit', {
        ...ctx,
        step: 'rate_limit_check',
      });
      throw new OtpRateLimitExceededException(
        'Please wait 60 seconds before requesting another verification code.',
      );
    }

    this.logger.debug('Stored email verification OTP in Redis', {
      ...ctx,
      step: 'persist_otp',
      otpTtl: EmailVerificationService.EMAIL_OTP_TTL_SECONDS,
    });

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
   * @throws {IdentityAlreadyClaimedException} When the email is already claimed by another user.
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

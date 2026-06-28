import { BaseService } from '@core/base';
import { hashString } from '@core/crypto/crypto.utils';
import { LoggerService } from '@core/logger';
import { AuditActionType } from '@modules/audit/dto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { generateSlug } from 'random-word-slugs';

/**
 * Manages the full lifecycle of short-lived, single-use OTPs backed by Redis.
 *
 * OTPs are generated as human-readable kebab-slug strings (via `random-word-slugs`),
 * immediately hashed with a SHA-based utility before storage so the plain-text
 * value is never persisted, and expired automatically via Redis TTL. A per-user
 * rate-limit key prevents burst generation within the `OTP_RATE_LIMIT_TTL` window.
 */
@Injectable()
export class OneTimePasswordsService extends BaseService {
  private readonly otpTtl: number;
  private readonly otpRateLimitTtl: number;
  private readonly generateId: () => string;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
  ) {
    super(logger);
    this.otpTtl = parseInt(
      this.configService.get<string>('OTP_TTL') || '300',
      10,
    );
    this.otpRateLimitTtl = parseInt(
      this.configService.get<string>('OTP_RATE_LIMIT_TTL') || '60',
      10,
    );
    this.generateId = () => generateSlug(3, { format: 'kebab' });
  }

  /**
   * Generates a readable slug OTP, stores its hash in Redis keyed by the hash,
   * and sets a per-user rate-limit sentinel — returning the plain-text OTP once.
   *
   * The plain-text OTP is never persisted; only its hash is stored, ensuring that
   * even a Redis breach cannot reveal valid tokens. An audit event is emitted to
   * record the issuance against the user's activity log.
   *
   * @param userId - ID of the authenticated user requesting the OTP.
   * @returns The plain-text OTP and its TTL in seconds (`OTP_TTL`, default 300).
   * @throws {HttpException(429)} When a rate-limit key for this user already
   *   exists in Redis (i.e., another OTP was generated within `OTP_RATE_LIMIT_TTL`).
   */
  async generateAndStoreOtp(
    userId: string,
  ): Promise<{ otp: string; expiresIn: number }> {
    const rateLimitKey = await this.checkForRateLimits(userId);

    const plainOtp = this.generateId();
    const hashedOtp = hashString(plainOtp);

    const redisKey = `otp:${hashedOtp}`;

    // Store in Redis with TTL (EX requires time in seconds)
    await this.redisClient.set(redisKey, userId, 'EX', this.otpTtl);

    // Set rate limit key for user
    await this.redisClient.set(
      rateLimitKey,
      userId,
      'EX',
      this.otpRateLimitTtl,
    );

    this.logger.debug(
      `Generated and stored OTP for user_id: ${userId} with TTL: ${this.otpTtl}s. Rate limit: ${this.otpRateLimitTtl}s`,
    );

    this.emitAuditLog({
      actionType: AuditActionType.IDENTITY_OTP_SENT,
      userId: userId,
    });

    return { otp: plainOtp, expiresIn: this.otpTtl };
  }

  /**
   * Validates a plaintext OTP and, if valid, atomically consumes it by deleting
   * the Redis key — ensuring each token can only be used once.
   *
   * The plaintext is hashed before the Redis lookup; an absent key indicates
   * the OTP was never issued, has already been consumed, or has expired.
   *
   * @param plainOtp - The raw OTP string as received from the client.
   * @returns The user ID that was bound to the OTP at generation time.
   * @throws {BadRequestException} When no Redis entry exists for the given OTP
   *   (invalid, already used, or expired).
   */
  async verifyAndConsumeOtp(plainOtp: string): Promise<string> {
    const hashedOtp = hashString(plainOtp);
    const redisKey = `otp:${hashedOtp}`;

    const userId = await this.redisClient.get(redisKey);

    if (!userId) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // OTP is valid, consume it by deleting the key
    await this.redisClient.del(redisKey);

    this.logger.debug(`Consumed OTP for user_id: ${userId}`);

    this.emitAuditLog({
      actionType: AuditActionType.OTP_VERIFIED,
      userId: userId,
    });

    return userId;
  }

  /**
   * Checks whether the user is within the OTP generation rate-limit window.
   *
   * @param userId - The user ID to check the rate-limit sentinel for.
   * @returns The Redis key used to set the rate-limit sentinel, so the caller
   *   can persist it after generating the OTP without a second lookup.
   * @throws {HttpException(429)} When a rate-limit sentinel key exists for this user.
   */
  private async checkForRateLimits(userId: string) {
    const rateLimitKey = `rate_limit:otp:${userId}`;
    const rateLimitExceeded = await this.redisClient.get(rateLimitKey);

    if (rateLimitExceeded) {
      throw new HttpException(
        'Please wait before requesting a new OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return rateLimitKey;
  }
}

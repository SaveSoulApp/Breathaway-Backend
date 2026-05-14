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
import { BaseService } from 'src/base/services/base.service';
import { hashString } from 'src/common/utils/crypto.utils';
import { LoggerService } from 'src/core/logger/logger.service';

@Injectable()
export class OtpService extends BaseService {
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
   * Generates a new OTP, hashes it, stores it in Redis with the given user_id,
   * and returns the plain text OTP.
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

    return { otp: plainOtp, expiresIn: this.otpTtl };
  }

  /**
   * Verifies an OTP by its plaintext value.
   * If found, deletes the OTP and returns the associated userId.
   * If not found, throws a BadRequestException.
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

    return userId;
  }

  /**
   * Checks if the user has exceeded the rate limit for generating OTPs.
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

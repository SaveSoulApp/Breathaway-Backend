import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';
import {
  OtpRateLimitExceededException,
  InvalidOtpException,
} from '../application/exceptions';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { hashString } from '@core/crypto/crypto.utils';
import { OneTimePasswordsService } from '../one-time-passwords.service';
import { ClsService } from 'nestjs-cls';

jest.mock('@core/crypto/crypto.utils', () => ({
  hashString: jest.fn(),
}));

// We mock 'random-word-slugs' so it returns a predictable OTP
jest.mock('random-word-slugs', () => ({
  generateSlug: jest.fn().mockReturnValue('abc-def-ghi'),
}));

describe('OneTimePasswordsService', () => {
  let service: OneTimePasswordsService;
  let redisClientMock: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let configServiceMock: jest.Mocked<ConfigService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';
  const plainOtp = 'abc-def-ghi';
  const hashedOtpMock = 'hashed-abc-def-ghi';
  const otpTtl = 300;
  const otpRateLimitTtl = 60;

  beforeEach(async () => {
    redisClientMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'OTP_TTL') return String(otpTtl);
        if (key === 'OTP_RATE_LIMIT_TTL') return String(otpRateLimitTtl);
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    (hashString as jest.Mock).mockReturnValue(hashedOtpMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        OneTimePasswordsService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: LoggerService, useValue: loggerServiceMock },
        { provide: 'REDIS_CLIENT', useValue: redisClientMock },
      ],
    }).compile();

    service = module.get<OneTimePasswordsService>(OneTimePasswordsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndStoreOtp', () => {
    it('should successfully generate, store, and return an OTP', async () => {
      // Arrange
      redisClientMock.get.mockResolvedValue(null); // No rate limit hit
      redisClientMock.set.mockResolvedValue('OK');

      // Act
      const result = await service.generateAndStoreOtp(userId);

      // Assert
      expect(redisClientMock.get).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
      );
      expect(hashString).toHaveBeenCalledWith(plainOtp);
      expect(redisClientMock.set).toHaveBeenCalledWith(
        `otp:${hashedOtpMock}`,
        userId,
        'EX',
        otpTtl,
      );
      expect(redisClientMock.set).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
        userId,
        'EX',
        otpRateLimitTtl,
      );
      expect(result).toEqual({ otp: plainOtp, expiresIn: otpTtl });
    });

    it('should throw an exception if rate limit is exceeded', async () => {
      // Arrange
      redisClientMock.get.mockResolvedValue('user-id-123'); // Rate limit hit

      // Act & Assert
      await expect(service.generateAndStoreOtp(userId)).rejects.toThrow(
        new OtpRateLimitExceededException(),
      );

      expect(redisClientMock.get).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
      );
      expect(redisClientMock.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndConsumeOtp', () => {
    it('should verify OTP and consume it', async () => {
      // Arrange
      redisClientMock.get.mockResolvedValue(userId);
      redisClientMock.del.mockResolvedValue(1);

      // Act
      const result = await service.verifyAndConsumeOtp(plainOtp);

      // Assert
      expect(hashString).toHaveBeenCalledWith(plainOtp);
      expect(redisClientMock.get).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(redisClientMock.del).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(result).toBe(userId);
    });

    it('should throw InvalidOtpException if OTP is invalid or expired', async () => {
      // Arrange
      redisClientMock.get.mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyAndConsumeOtp(plainOtp)).rejects.toThrow(
        new InvalidOtpException(),
      );

      expect(hashString).toHaveBeenCalledWith(plainOtp);
      expect(redisClientMock.get).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(redisClientMock.del).not.toHaveBeenCalled();
    });
  });
});

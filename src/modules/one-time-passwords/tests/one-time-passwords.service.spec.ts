import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { hashString } from '@core/crypto/crypto.utils';
import { LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';

import {
  InvalidOtpException,
  OtpRateLimitExceededException,
} from '../application/exceptions';
import { OneTimePasswordsService } from '../one-time-passwords.service';

jest.mock('@core/crypto/crypto.utils', () => ({
  hashString: jest.fn(),
}));

describe('OneTimePasswordsService', () => {
  let service: OneTimePasswordsService;
  let mockRedisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    isConfigured: boolean;
  };
  let configServiceMock: jest.Mocked<ConfigService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';
  const plainOtp = 'abc-def-ghi';
  const hashedOtpMock = 'hashed-abc-def-ghi';
  const otpTtl = 300;
  const otpRateLimitTtl = 60;

  beforeEach(async () => {
    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      isConfigured: true,
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
        info: jest.fn(),
        event: jest.fn(),
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
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<OneTimePasswordsService>(OneTimePasswordsService);
    (service as any).generateId = () => plainOtp;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndStoreOtp', () => {
    it('should successfully generate, store, and return an OTP', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValue(null); // No rate limit hit
      mockRedisService.set.mockResolvedValue('OK');

      // Act
      const result = await service.generateAndStoreOtp(userId);

      // Assert
      expect(mockRedisService.get).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `otp:${hashedOtpMock}`,
        userId,
        'EX',
        otpTtl,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
        userId,
        'EX',
        otpRateLimitTtl,
      );
      expect(result).toEqual({
        otp: plainOtp,
        message: expect.any(String),
        expiresIn: otpTtl,
      });
    });

    it('should throw OtpRateLimitExceededException if rate limit is exceeded', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValue('user-id-123'); // Rate limit hit

      // Act & Assert
      await expect(service.generateAndStoreOtp(userId)).rejects.toThrow(
        new OtpRateLimitExceededException(),
      );

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `rate_limit:otp:${userId}`,
      );
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndConsumeOtp', () => {
    it('should verify OTP, delete it from redis, and return userId', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValue(userId);
      mockRedisService.del.mockResolvedValue(1);

      // Act
      const result = await service.verifyAndConsumeOtp(plainOtp);

      // Assert
      expect(hashString).toHaveBeenCalledWith(plainOtp);
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(mockRedisService.del).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(result).toBe(userId);
    });

    it('should throw InvalidOtpException if OTP is invalid or expired', async () => {
      // Arrange
      mockRedisService.get.mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyAndConsumeOtp(plainOtp)).rejects.toThrow(
        new InvalidOtpException(),
      );

      expect(hashString).toHaveBeenCalledWith(plainOtp);
      expect(mockRedisService.get).toHaveBeenCalledWith(`otp:${hashedOtpMock}`);
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });
});

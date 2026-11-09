import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { OTP_GENERATE_THROTTLE, OTP_VERIFY_THROTTLE } from '../constants';
import { VerifyOtpDto } from '../dto';
import { OneTimePasswordsController } from '../one-time-passwords.controller';
import { OneTimePasswordsService } from '../one-time-passwords.service';

describe('OneTimePasswordsController', () => {
  let controller: OneTimePasswordsController;
  let service: jest.Mocked<OneTimePasswordsService>;
  let reflector: Reflector;

  const userId = 'user-id-123';

  beforeEach(async () => {
    const mockService = {
      generateAndStoreOtp: jest.fn(),
      verifyAndConsumeOtp: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OneTimePasswordsController],
      providers: [
        Reflector,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: OneTimePasswordsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<OneTimePasswordsController>(
      OneTimePasswordsController,
    );
    service = module.get(OneTimePasswordsService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Throttle Metadata Verification', () => {
    it('should attach strict throttling metadata to generateOtp', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.generateOtp,
      );
      const mediumLimit = reflector.get(
        THROTTLER_LIMIT + 'medium',
        controller.generateOtp,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.generateOtp,
      );

      expect(shortLimit).toBe(OTP_GENERATE_THROTTLE.short.limit);
      expect(mediumLimit).toBe(OTP_GENERATE_THROTTLE.medium.limit);
      expect(longLimit).toBe(OTP_GENERATE_THROTTLE.long.limit);

      const shortTtl = reflector.get(
        THROTTLER_TTL + 'short',
        controller.generateOtp,
      );
      const mediumTtl = reflector.get(
        THROTTLER_TTL + 'medium',
        controller.generateOtp,
      );
      const longTtl = reflector.get(
        THROTTLER_TTL + 'long',
        controller.generateOtp,
      );

      expect(shortTtl).toBe(OTP_GENERATE_THROTTLE.short.ttl);
      expect(mediumTtl).toBe(OTP_GENERATE_THROTTLE.medium.ttl);
      expect(longTtl).toBe(OTP_GENERATE_THROTTLE.long.ttl);
    });

    it('should attach strict throttling metadata to verifyOtp', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.verifyOtp,
      );
      const mediumLimit = reflector.get(
        THROTTLER_LIMIT + 'medium',
        controller.verifyOtp,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.verifyOtp,
      );

      expect(shortLimit).toBe(OTP_VERIFY_THROTTLE.short.limit);
      expect(mediumLimit).toBe(OTP_VERIFY_THROTTLE.medium.limit);
      expect(longLimit).toBe(OTP_VERIFY_THROTTLE.long.limit);

      const shortTtl = reflector.get(
        THROTTLER_TTL + 'short',
        controller.verifyOtp,
      );
      const mediumTtl = reflector.get(
        THROTTLER_TTL + 'medium',
        controller.verifyOtp,
      );
      const longTtl = reflector.get(
        THROTTLER_TTL + 'long',
        controller.verifyOtp,
      );

      expect(shortTtl).toBe(OTP_VERIFY_THROTTLE.short.ttl);
      expect(mediumTtl).toBe(OTP_VERIFY_THROTTLE.medium.ttl);
      expect(longTtl).toBe(OTP_VERIFY_THROTTLE.long.ttl);
    });
  });

  describe('generateOtp', () => {
    it('should generate and return a new OTP', async () => {
      // Arrange
      const resultData = {
        otp: 'abc-def-ghi',
        message: 'Hey Breathaway! My code is abc-def-ghi. Thanks!',
        expiresIn: 300,
      };
      service.generateAndStoreOtp.mockResolvedValue(resultData);

      // Act
      const result = await controller.generateOtp(userId);

      // Assert
      expect(service.generateAndStoreOtp).toHaveBeenCalledWith(userId);
      expect(result).toEqual(resultData);
    });
  });

  describe('verifyOtp', () => {
    it('should verify the OTP and return the userId', async () => {
      // Arrange
      const dto: VerifyOtpDto = { otp: 'abc-def-ghi' };
      service.verifyAndConsumeOtp.mockResolvedValue(userId);

      // Act
      const result = await controller.verifyOtp(dto);

      // Assert
      expect(service.verifyAndConsumeOtp).toHaveBeenCalledWith(dto.otp);
      expect(result).toEqual({ userId });
    });
  });
});

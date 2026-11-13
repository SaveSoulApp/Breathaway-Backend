import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { hashString } from '@core/crypto/crypto.utils';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { RedisService } from '@infrastructure/redis';
import { IdentityAlreadyClaimedException } from '@modules/identities/application/exceptions';
import {
  EMAIL_VERIFICATION_REQUESTED_EVENT,
  IDENTITY_ADDED_EVENT,
} from '@modules/identities/events';
import { IdentitiesService } from '@modules/identities/identities.service';
import {
  InvalidOtpException,
  OtpRateLimitExceededException,
} from '@modules/one-time-passwords/application/exceptions';

import { SendEmailOtpRequestDto, VerifyEmailOtpRequestDto } from '../dto';
import { EmailVerificationService } from '../email-verification.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prisma: MockPrismaService;
  let encryption: jest.Mocked<IdentityCryptoService>;
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    ttl: jest.Mock;
    incr: jest.Mock;
    incrWithTtl: jest.Mock;
    eval: jest.Mock;
  };
  let identitiesService: {
    claimOrCreateIdentity: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let clsService: { get: jest.Mock };

  const mockUserId = 'user-123';
  const mockEmail = 'test@example.com';
  const mockIdentityId = 'identity-123';

  const mockEncryptedData = {
    publicValueHash: Buffer.from('mock-email-hash-32-bytes-long!'),
    publicValueCiphertext: Buffer.from('mock-ciphertext'),
    publicValueIv: Buffer.from('mock-iv-12-byte'),
    publicValueTag: Buffer.from('mock-tag-16-byte'),
    publicValueWrappedKey: Buffer.from('mock-wrapped-key'),
    publicValueKeyId: 'mock-key-id',
    publicValueMasked: 't•••t@example.com',
  };

  const mockIdentityResponse = {
    id: mockIdentityId,
    type: IdentityType.EMAIL,
    isVerified: true,
    verifiedAt: new Date(),
    createdAt: new Date(),
    deletedAt: null,
    userId: mockUserId,
    publicValueMasked: 't•••t@example.com',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    eventEmitter = { emit: jest.fn() };
    clsService = { get: jest.fn() };

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      incrWithTtl: jest.fn().mockResolvedValue(1),
      eval: jest.fn(),
    };

    identitiesService = {
      claimOrCreateIdentity: jest.fn(),
    };

    const mockEncryptionService = {
      processPublicValue: jest.fn().mockResolvedValue(mockEncryptedData),
      maskPublicValue: jest.fn((val) => val),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        event: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdentityCryptoService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: redisService },
        { provide: IdentitiesService, useValue: identitiesService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ClsService, useValue: clsService },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
    encryption = module.get(IdentityCryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmailOtp', () => {
    it('should successfully generate OTP, persist in Redis, emit event, and return response', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([1, 'OK']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act
      const result = await service.sendEmailOtp(mockUserId, dto);

      // Assert
      expect(result).toEqual({
        message: 'Verification code sent to email',
        expiresIn: 600,
        resendAfter: 60,
      });

      expect(redisService.eval).toHaveBeenCalledWith(
        expect.stringContaining('USER_COOLDOWN'),
        [
          `rate_limit:email_otp:user:${mockUserId}`,
          expect.stringContaining('rate_limit:email_otp:email:'),
          `rate_limit:email_otp:hourly:${mockUserId}`,
          expect.stringContaining('rate_limit:email_otp:hourly:email:'),
          expect.stringContaining(`email_verification_otp:${mockUserId}:`),
        ],
        [60, 5, 3600, expect.stringContaining('otpHash'), 600],
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EMAIL_VERIFICATION_REQUESTED_EVENT,
        expect.objectContaining({
          userId: mockUserId,
          email: mockEmail,
          expiresInSeconds: 600,
        }),
      );
    });

    it('should throw ConflictException if email is already verified and linked to caller', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue({
        id: 'id-1',
      } as any);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act & Assert
      await expect(service.sendEmailOtp(mockUserId, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: IdentityType.EMAIL,
          publicValueHash: mockEncryptedData.publicValueHash,
          userId: mockUserId,
          isVerified: true,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      expect(redisService.eval).not.toHaveBeenCalled();
    });

    it('should scope ownership check strictly to caller and send OTP even when email is owned by another user', async () => {
      // Arrange — query is scoped to caller userId, so another user's verified identity yields null
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([1, 'OK']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act
      const result = await service.sendEmailOtp(mockUserId, dto);

      // Assert
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: IdentityType.EMAIL,
          publicValueHash: mockEncryptedData.publicValueHash,
          userId: mockUserId,
          isVerified: true,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      expect(result.expiresIn).toBe(600);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EMAIL_VERIFICATION_REQUESTED_EVENT,
        expect.objectContaining({ email: mockEmail }),
      );
    });

    it('should throw OtpRateLimitExceededException when user cooldown is active', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([0, 'USER_COOLDOWN']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act & Assert
      await expect(service.sendEmailOtp(mockUserId, dto)).rejects.toThrow(
        'Please wait 60 seconds before requesting another verification code.',
      );
    });

    it('should throw OtpRateLimitExceededException when email cooldown is active', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([0, 'EMAIL_COOLDOWN']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act & Assert
      await expect(service.sendEmailOtp(mockUserId, dto)).rejects.toThrow(
        'A verification code was recently sent to this email. Please wait 60 seconds.',
      );
    });

    it('should throw OtpRateLimitExceededException when user hourly limit is reached', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([0, 'USER_HOURLY_LIMIT', '5']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act & Assert
      await expect(service.sendEmailOtp(mockUserId, dto)).rejects.toThrow(
        'You have exceeded the maximum email verification attempts for this hour. Please try again later.',
      );
    });

    it('should throw OtpRateLimitExceededException when email hourly limit is reached', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);
      redisService.eval.mockResolvedValue([0, 'EMAIL_HOURLY_LIMIT', '5']);

      const dto: SendEmailOtpRequestDto = { email: mockEmail };

      // Act & Assert
      await expect(service.sendEmailOtp(mockUserId, dto)).rejects.toThrow(
        'This email address has exceeded the maximum verification attempts for this hour. Please try again later.',
      );
    });
  });

  describe('verifyEmailOtp', () => {
    it('should successfully verify OTP, delete Redis key, delegate to identitiesService, emit IDENTITY_ADDED, and return identity', async () => {
      // Arrange
      const plainOtp = '482910';
      const otpHash = hashString(plainOtp);

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 0,
          maxAttempts: 5,
        }),
      );

      identitiesService.claimOrCreateIdentity.mockResolvedValue(
        mockIdentityResponse,
      );

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: plainOtp,
      };

      // Act
      const result = await service.verifyEmailOtp(mockUserId, dto);

      // Assert
      expect(redisService.del).toHaveBeenCalled();
      expect(identitiesService.claimOrCreateIdentity).toHaveBeenCalledWith(
        IdentityType.EMAIL,
        mockEmail,
        undefined,
        mockUserId,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IDENTITY_ADDED_EVENT,
        expect.objectContaining({
          userId: mockUserId,
          identityType: IdentityType.EMAIL,
          isVerified: true,
        }),
      );
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should throw IdentityAlreadyClaimedException when OTP is valid but email is already claimed by another user', async () => {
      // Arrange
      const plainOtp = '482910';
      const otpHash = hashString(plainOtp);

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 0,
          maxAttempts: 5,
        }),
      );

      identitiesService.claimOrCreateIdentity.mockRejectedValue(
        new IdentityAlreadyClaimedException(),
      );

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: plainOtp,
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        IdentityAlreadyClaimedException,
      );
      expect(redisService.del).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        IDENTITY_ADDED_EVENT,
        expect.anything(),
      );
    });

    it('should throw InvalidOtpException if OTP is expired or not found in Redis', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: '482910',
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        InvalidOtpException,
      );
    });

    it('should increment attempts and throw InvalidOtpException on OTP mismatch', async () => {
      // Arrange
      const wrongOtpHash = hashString('999999');

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash: wrongOtpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 1,
          maxAttempts: 5,
        }),
      );
      redisService.ttl.mockResolvedValue(450);

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: '482910',
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        /Invalid verification code\. 3 attempts remaining\./,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining(`email_verification_otp:${mockUserId}:`),
        expect.stringContaining('"attempts":2'),
        'EX',
        450,
      );
    });

    it('should burn OTP and throw InvalidOtpException when attempts reach maxAttempts', async () => {
      // Arrange
      const wrongOtpHash = hashString('999999');

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash: wrongOtpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 4,
          maxAttempts: 5,
        }),
      );

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: '482910',
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        'Maximum verification attempts exceeded. Please request a new code.',
      );

      expect(redisService.del).toHaveBeenCalled();
    });

    it('should burn OTP immediately if already at max attempts upon lookup', async () => {
      // Arrange
      const wrongOtpHash = hashString('999999');

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash: wrongOtpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 5,
          maxAttempts: 5,
        }),
      );

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: '482910',
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        'Maximum verification attempts exceeded. Please request a new code.',
      );

      expect(redisService.del).toHaveBeenCalled();
    });

    it('should burn OTP and throw InvalidOtpException if remaining TTL is 0 or negative on mismatch', async () => {
      // Arrange
      const wrongOtpHash = hashString('999999');

      redisService.get.mockResolvedValue(
        JSON.stringify({
          otpHash: wrongOtpHash,
          userId: mockUserId,
          email: mockEmail,
          attempts: 1,
          maxAttempts: 5,
        }),
      );
      redisService.ttl.mockResolvedValue(0);

      const dto: VerifyEmailOtpRequestDto = {
        email: mockEmail,
        otp: '482910',
      };

      // Act & Assert
      await expect(service.verifyEmailOtp(mockUserId, dto)).rejects.toThrow(
        'Verification code has expired or is invalid',
      );

      expect(redisService.del).toHaveBeenCalled();
    });
  });
});

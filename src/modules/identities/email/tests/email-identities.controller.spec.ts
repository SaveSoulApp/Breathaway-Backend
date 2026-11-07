import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { IdentityResponseDto } from '@modules/identities/dto';

import {
  SendEmailOtpRequestDto,
  SendEmailOtpResponseDto,
  VerifyEmailOtpRequestDto,
} from '../dto';
import { EmailIdentitiesController } from '../email-identities.controller';
import { EmailVerificationService } from '../email-verification.service';

describe('EmailIdentitiesController', () => {
  let controller: EmailIdentitiesController;
  let service: jest.Mocked<EmailVerificationService>;

  const mockUserId = 'user-123';

  beforeEach(async () => {
    const mockService = {
      sendEmailOtp: jest.fn(),
      verifyEmailOtp: jest.fn(),
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
      controllers: [EmailIdentitiesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EmailVerificationService, useValue: mockService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<EmailIdentitiesController>(
      EmailIdentitiesController,
    );
    service = module.get(EmailVerificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmailOtp', () => {
    it('should delegate to emailVerificationService.sendEmailOtp and return response', async () => {
      // Arrange
      const dto: SendEmailOtpRequestDto = { email: 'test@example.com' };
      const expectedResponse: SendEmailOtpResponseDto = {
        message: 'Verification code sent to email',
        expiresIn: 600,
        resendAfter: 60,
      };
      service.sendEmailOtp.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.sendEmailOtp(mockUserId, dto);

      // Assert
      expect(service.sendEmailOtp).toHaveBeenCalledWith(mockUserId, dto);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('verifyEmailOtp', () => {
    it('should delegate to emailVerificationService.verifyEmailOtp and return masked identity', async () => {
      // Arrange
      const dto: VerifyEmailOtpRequestDto = {
        email: 'test@example.com',
        otp: '482910',
      };
      const mockIdentityResponse: Partial<IdentityResponseDto> = {
        id: 'identity-123',
        userId: mockUserId,
        publicValueMasked: 't•••t@example.com',
        isVerified: true,
      };
      service.verifyEmailOtp.mockResolvedValue(mockIdentityResponse as any);

      // Act
      const result = await controller.verifyEmailOtp(mockUserId, dto);

      // Assert
      expect(service.verifyEmailOtp).toHaveBeenCalledWith(mockUserId, dto);
      expect(result).toEqual(mockIdentityResponse);
    });
  });
});

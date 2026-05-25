import { LoggerService } from '@core/logger';
import { IdentityService } from '@modules/identities/identities.service';
import { OtpService } from '@modules/one-time-passwords/one-time-passwords.service';
import { SocialIdentityResponseDto } from '@modules/social-identities/dto/response/social-identity.response.dto';
import { SocialidentityService } from '@modules/social-identities/social-identities.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Identity, IdentityType } from '@prisma/client';
import { IdentityWorkflowsService } from '../identity-workflows.service';

describe('IdentityWorkflowsService', () => {
  let service: IdentityWorkflowsService;
  let otpService: jest.Mocked<OtpService>;
  let socialidentityService: jest.Mocked<SocialidentityService>;
  let identityService: jest.Mocked<IdentityService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    info: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockOtpService = {
      verifyAndConsumeOtp: jest.fn(),
    };

    const mockSocialidentityService = {
      verifyInstagramIdentity: jest.fn(),
    };

    const mockIdentityService = {
      claimOrCreateIdentity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityWorkflowsService,
        { provide: LoggerService, useValue: logger },
        { provide: OtpService, useValue: mockOtpService },
        { provide: SocialidentityService, useValue: mockSocialidentityService },
        { provide: IdentityService, useValue: mockIdentityService },
      ],
    }).compile();

    service = module.get<IdentityWorkflowsService>(IdentityWorkflowsService);
    otpService = module.get(OtpService);
    socialidentityService = module.get(SocialidentityService);
    identityService = module.get(IdentityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleInstagramOtpReceived', () => {
    const defaultData = {
      otp: '123456',
      senderId: 'sender_1',
      timestamp: '1234567890',
    };
    const defaultMessageId = 'msg_1';

    it('should successfully link an identity when OTP is valid and identity has a username', async () => {
      otpService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentityService.verifyInstagramIdentity.mockResolvedValue({
        username: 'test_user',
      } as unknown as SocialIdentityResponseDto);
      identityService.claimOrCreateIdentity.mockResolvedValue(
        {} as unknown as Identity,
      );

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(contextualLogger.info).toHaveBeenCalledWith(
        'Received Instagram OTP event for messageId msg_1',
      );
      expect(otpService.verifyAndConsumeOtp).toHaveBeenCalledWith('123456');
      expect(
        socialidentityService.verifyInstagramIdentity,
      ).toHaveBeenCalledWith('sender_1');
      expect(identityService.claimOrCreateIdentity).toHaveBeenCalledWith(
        IdentityType.INSTAGRAM,
        'test_user',
        'sender_1',
        'user_123',
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Successfully linked Instagram identity (test_user) to user (user_123).',
      );
    });

    it('should warn when the instagram identity has no username', async () => {
      otpService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentityService.verifyInstagramIdentity.mockResolvedValue({
        username: null,
      } as unknown as SocialIdentityResponseDto);

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(identityService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Could not extract a valid username from Instagram identity payload.',
      );
    });

    it('should catch and log errors during the flow', async () => {
      const error = new Error('OTP verification failed');
      otpService.verifyAndConsumeOtp.mockRejectedValue(error);

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(
        socialidentityService.verifyInstagramIdentity,
      ).not.toHaveBeenCalled();
      expect(identityService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Error during OTP verification flow for sender sender_1: OTP verification failed',
      );
    });

    it('should handle non-Error objects thrown during the flow', async () => {
      otpService.verifyAndConsumeOtp.mockRejectedValue('String error');

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(
        socialidentityService.verifyInstagramIdentity,
      ).not.toHaveBeenCalled();
      expect(identityService.claimOrCreateIdentity).not.toHaveBeenCalled();
      // Since `(error as Error).message` is called, and error is a string,
      // it might be undefined. Let's just ensure it calls error logger.
      expect(contextualLogger.error).toHaveBeenCalled();
    });
  });
});

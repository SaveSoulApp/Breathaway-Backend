import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { IdentityService } from '@modules/identities/identities.service';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { OtpService } from '@modules/one-time-passwords/one-time-passwords.service';
import { SocialIdentityResponseDto } from '@modules/social-identities/dto/response/social-identity.response.dto';
import { SocialidentityService } from '@modules/social-identities/social-identities.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Identity, IdentityType, IntentType, LikeStatus } from '@prisma/client';
import { IdentityWorkflowsService } from '../identity-workflows.service';

describe('IdentityWorkflowsService', () => {
  let service: IdentityWorkflowsService;
  let prisma: MockPrismaService;
  let otpService: jest.Mocked<OtpService>;
  let socialidentityService: jest.Mocked<SocialidentityService>;
  let identityService: jest.Mocked<IdentityService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let matchResolverService: jest.Mocked<MatchResolverService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    info: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
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

    const mockNotificationsService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const mockMatchResolverService = {
      resolveFromLike: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityWorkflowsService,
        { provide: LoggerService, useValue: logger },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: OtpService, useValue: mockOtpService },
        { provide: SocialidentityService, useValue: mockSocialidentityService },
        { provide: IdentityService, useValue: mockIdentityService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: MatchResolverService, useValue: mockMatchResolverService },
      ],
    }).compile();

    service = module.get<IdentityWorkflowsService>(IdentityWorkflowsService);
    prisma = module.get(PrismaService);
    otpService = module.get(OtpService);
    socialidentityService = module.get(SocialidentityService);
    identityService = module.get(IdentityService);
    notificationsService = module.get(NotificationsService);
    matchResolverService = module.get(MatchResolverService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // handleInstagramOtpReceived
  // ---------------------------------------------------------------------------

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
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['user_123'],
          title: 'Identity Claimed',
        }),
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
      expect(contextualLogger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // handleIdentityClaimed
  // ---------------------------------------------------------------------------

  describe('handleIdentityClaimed', () => {
    const userId = 'user_abc';
    const messageId = 'msg_claim_1';
    const identityId = 'identity_xyz';

    it('should skip all processing when the user has no active identities', async () => {
      prisma.identity.findMany.mockResolvedValue([] as any);

      await service.handleIdentityClaimed({ userId }, messageId);

      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.like.updateMany).not.toHaveBeenCalled();
      expect(prisma.like.findMany).not.toHaveBeenCalled();
      expect(matchResolverService.resolveFromLike).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No active identities'),
      );
    });

    it('should backfill all unresolved likes (including expired/deleted) regardless of status', async () => {
      prisma.identity.findMany.mockResolvedValue([{ id: identityId }] as any);
      // Backfill returns 3 rows updated (e.g., 1 valid + 2 expired)
      prisma.like.updateMany.mockResolvedValue({ count: 3 });
      // Resolution query finds no actionable likes (all were expired)
      prisma.like.findMany.mockResolvedValue([] as any);

      await service.handleIdentityClaimed({ userId }, messageId);

      // Backfill called with NO expiry/status/deletedAt filter
      expect(prisma.like.updateMany).toHaveBeenCalledWith({
        where: {
          targetIdentityId: { in: [identityId] },
          targetUserId: null,
        },
        data: { targetUserId: userId },
      });

      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Backfilled'),
      );
      // No matches attempted since actionableLikes is empty
      expect(matchResolverService.resolveFromLike).not.toHaveBeenCalled();
    });

    it('should run match resolution only for PENDING non-expired non-deleted likes', async () => {
      const pendingLike = {
        id: 'like_1',
        senderUserId: 'user_sender',
        targetUserId: userId,
        intent: IntentType.OPEN,
        status: LikeStatus.PENDING,
      };

      prisma.identity.findMany.mockResolvedValue([{ id: identityId }] as any);
      prisma.like.updateMany.mockResolvedValue({ count: 1 });
      prisma.like.findMany.mockResolvedValue([pendingLike] as any);

      await service.handleIdentityClaimed({ userId }, messageId);

      // Resolution query must filter on targetUserId (already backfilled),
      // PENDING status, no deletedAt, and not expired.
      expect(prisma.like.findMany).toHaveBeenCalledWith({
        where: {
          targetIdentityId: { in: [identityId] },
          targetUserId: userId,
          status: LikeStatus.PENDING,
          deletedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        select: {
          id: true,
          senderUserId: true,
          targetUserId: true,
          intent: true,
          status: true,
        },
      });

      expect(matchResolverService.resolveFromLike).toHaveBeenCalledTimes(1);
      expect(matchResolverService.resolveFromLike).toHaveBeenCalledWith(
        pendingLike,
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Match resolution complete'),
      );
    });

    it('should continue resolving remaining likes when one resolution fails', async () => {
      const likes = [
        {
          id: 'like_1',
          senderUserId: 'user_a',
          targetUserId: userId,
          intent: IntentType.OPEN,
          status: LikeStatus.PENDING,
        },
        {
          id: 'like_2',
          senderUserId: 'user_b',
          targetUserId: userId,
          intent: IntentType.OPEN,
          status: LikeStatus.PENDING,
        },
      ];

      prisma.identity.findMany.mockResolvedValue([{ id: identityId }] as any);
      prisma.like.updateMany.mockResolvedValue({ count: 2 });
      prisma.like.findMany.mockResolvedValue(likes as any);

      // First like resolution fails, second succeeds
      matchResolverService.resolveFromLike
        .mockRejectedValueOnce(new Error('resolution error'))
        .mockResolvedValueOnce(undefined);

      await service.handleIdentityClaimed({ userId }, messageId);

      expect(matchResolverService.resolveFromLike).toHaveBeenCalledTimes(2);
      // Error logged for the failing like
      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('like_1'),
        expect.objectContaining({ error: 'resolution error' }),
      );
      // Final completion log still emitted
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Match resolution complete'),
      );
    });
  });
});

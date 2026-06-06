import { Test, TestingModule } from '@nestjs/testing';
import {
  Identity,
  IdentityType,
  IntentType,
  Like,
  LikeStatus,
} from '@prisma/client';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  MockPrismaService,
  createPrismaMock,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { IdentitiesService } from '@modules/identities/identities.service';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { OneTimePasswordsService } from '@modules/one-time-passwords/one-time-passwords.service';
import { SocialIdentityResponseDto } from '@modules/social-identities/dto/response/social-identity.response.dto';
import { SocialidentitiesService } from '@modules/social-identities/social-identities.service';
import { IdentityWorkflowsService } from '../identity-workflows.service';

describe('IdentityWorkflowsService', () => {
  let service: IdentityWorkflowsService;
  let prisma: MockPrismaService;
  let oneTimePasswordsService: jest.Mocked<OneTimePasswordsService>;
  let socialidentitiesService: jest.Mocked<SocialidentitiesService>;
  let identitiesService: jest.Mocked<IdentitiesService>;
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

    const mockOneTimePasswordsService = {
      verifyAndConsumeOtp: jest.fn(),
    };

    const mockSocialidentitiesService = {
      verifyInstagramIdentity: jest.fn(),
    };

    const mockIdentitiesService = {
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
        {
          provide: OneTimePasswordsService,
          useValue: mockOneTimePasswordsService,
        },
        {
          provide: SocialidentitiesService,
          useValue: mockSocialidentitiesService,
        },
        { provide: IdentitiesService, useValue: mockIdentitiesService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: MatchResolverService, useValue: mockMatchResolverService },
      ],
    }).compile();

    service = module.get<IdentityWorkflowsService>(IdentityWorkflowsService);
    prisma = module.get(PrismaService);
    oneTimePasswordsService = module.get(OneTimePasswordsService);
    socialidentitiesService = module.get(SocialidentitiesService);
    identitiesService = module.get(IdentitiesService);
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
      oneTimePasswordsService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentitiesService.verifyInstagramIdentity.mockResolvedValue({
        username: 'test_user',
      } as unknown as SocialIdentityResponseDto);
      identitiesService.claimOrCreateIdentity.mockResolvedValue(
        {} as unknown as Identity,
      );

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(contextualLogger.info).toHaveBeenCalledWith(
        'Received Instagram OTP event for messageId msg_1',
      );
      expect(oneTimePasswordsService.verifyAndConsumeOtp).toHaveBeenCalledWith(
        '123456',
      );
      expect(
        socialidentitiesService.verifyInstagramIdentity,
      ).toHaveBeenCalledWith('sender_1');
      expect(identitiesService.claimOrCreateIdentity).toHaveBeenCalledWith(
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
      oneTimePasswordsService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentitiesService.verifyInstagramIdentity.mockResolvedValue({
        username: null,
      } as unknown as SocialIdentityResponseDto);

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(identitiesService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Could not extract a valid username from Instagram identity payload.',
      );
    });

    it('should catch and log errors during the flow', async () => {
      const error = new Error('OTP verification failed');
      oneTimePasswordsService.verifyAndConsumeOtp.mockRejectedValue(error);

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(
        socialidentitiesService.verifyInstagramIdentity,
      ).not.toHaveBeenCalled();
      expect(identitiesService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Error during OTP verification flow for sender sender_1: OTP verification failed',
      );
    });

    it('should handle non-Error objects thrown during the flow', async () => {
      oneTimePasswordsService.verifyAndConsumeOtp.mockRejectedValue(
        'String error',
      );

      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      expect(
        socialidentitiesService.verifyInstagramIdentity,
      ).not.toHaveBeenCalled();
      expect(identitiesService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalled();
    });

    it('should silently log when notification dispatch fails after identity is linked', async () => {
      // Arrange
      oneTimePasswordsService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentitiesService.verifyInstagramIdentity.mockResolvedValue({
        username: 'test_user',
      } as unknown as SocialIdentityResponseDto);
      identitiesService.claimOrCreateIdentity.mockResolvedValue(
        {} as unknown as Identity,
      );
      const dispatchError = new Error('Push service unavailable');
      notificationsService.dispatch.mockRejectedValue(dispatchError);

      // Act — must not throw
      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      // Allow the fire-and-forget .catch() to run
      await Promise.resolve();

      // Assert — identity still linked, error logged via .catch
      expect(identitiesService.claimOrCreateIdentity).toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to dispatch identity claimed notification',
        ),
        expect.objectContaining({ error: dispatchError.message }),
      );
    });

    it('should warn and skip linking when username is an empty string (falsy)', async () => {
      // Arrange — empty string is falsy, so if (username) is false
      oneTimePasswordsService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      socialidentitiesService.verifyInstagramIdentity.mockResolvedValue({
        username: '',
      } as unknown as SocialIdentityResponseDto);

      // Act
      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      // Assert
      expect(identitiesService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Could not extract a valid username from Instagram identity payload.',
      );
    });

    it('should catch errors thrown by verifyInstagramIdentity after OTP is consumed', async () => {
      // Arrange
      oneTimePasswordsService.verifyAndConsumeOtp.mockResolvedValue('user_123');
      const socialError = new Error('Instagram API error');
      socialidentitiesService.verifyInstagramIdentity.mockRejectedValue(
        socialError,
      );

      // Act
      await service.handleInstagramOtpReceived(defaultData, defaultMessageId);

      // Assert
      expect(identitiesService.claimOrCreateIdentity).not.toHaveBeenCalled();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        `Error during OTP verification flow for sender ${defaultData.senderId}: ${socialError.message}`,
      );
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
      prisma.identity.findMany.mockResolvedValue([] as unknown as Identity[]);

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
      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
      ] as unknown as Identity[]);
      // Backfill returns 3 rows updated (e.g., 1 valid + 2 expired)
      prisma.like.updateMany.mockResolvedValue({ count: 3 });
      // Resolution query finds no actionable likes (all were expired)
      prisma.like.findMany.mockResolvedValue([] as unknown as Like[]);

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

      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
      ] as unknown as Identity[]);
      prisma.like.updateMany.mockResolvedValue({ count: 1 });
      prisma.like.findMany.mockResolvedValue([
        pendingLike,
      ] as unknown as Like[]);

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

      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
      ] as unknown as Identity[]);
      prisma.like.updateMany.mockResolvedValue({ count: 2 });
      prisma.like.findMany.mockResolvedValue(likes as unknown as Like[]);

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

    it('should include all identity IDs in the query when the user has multiple active identities', async () => {
      const secondIdentityId = 'identity_yyy';

      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
        { id: secondIdentityId },
      ] as unknown as Identity[]);
      prisma.like.updateMany.mockResolvedValue({ count: 0 });
      prisma.like.findMany.mockResolvedValue([] as unknown as Like[]);

      await service.handleIdentityClaimed({ userId }, messageId);

      // Backfill must pass BOTH identity IDs
      expect(prisma.like.updateMany).toHaveBeenCalledWith({
        where: {
          targetIdentityId: { in: [identityId, secondIdentityId] },
          targetUserId: null,
        },
        data: { targetUserId: userId },
      });

      // Resolution query must also scope to both IDs
      expect(prisma.like.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            targetIdentityId: { in: [identityId, secondIdentityId] },
          }),
        }),
      );
    });

    it('should log zero-row backfill and still run the resolution pass', async () => {
      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
      ] as unknown as Identity[]);
      // No historical likes to backfill
      prisma.like.updateMany.mockResolvedValue({ count: 0 });
      prisma.like.findMany.mockResolvedValue([] as unknown as Like[]);

      await service.handleIdentityClaimed({ userId }, messageId);

      // Backfill log should mention 0
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('0 like(s)'),
      );
      // Resolution still attempted (finds nothing, returns early)
      expect(prisma.like.findMany).toHaveBeenCalled();
      expect(matchResolverService.resolveFromLike).not.toHaveBeenCalled();
    });

    it('should resolve all actionable likes and emit completion log when all succeed', async () => {
      const likes = [
        {
          id: 'like_a',
          senderUserId: 'user_x',
          targetUserId: userId,
          intent: IntentType.OPEN,
          status: LikeStatus.PENDING,
        },
        {
          id: 'like_b',
          senderUserId: 'user_y',
          targetUserId: userId,
          intent: IntentType.OPEN,
          status: LikeStatus.PENDING,
        },
      ];

      prisma.identity.findMany.mockResolvedValue([
        { id: identityId },
      ] as unknown as Identity[]);
      prisma.like.updateMany.mockResolvedValue({ count: 2 });
      prisma.like.findMany.mockResolvedValue(likes as unknown as Like[]);
      matchResolverService.resolveFromLike.mockResolvedValue(undefined);

      await service.handleIdentityClaimed({ userId }, messageId);

      expect(matchResolverService.resolveFromLike).toHaveBeenCalledTimes(2);
      expect(contextualLogger.error).not.toHaveBeenCalled();
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Match resolution complete'),
      );
    });
  });
});

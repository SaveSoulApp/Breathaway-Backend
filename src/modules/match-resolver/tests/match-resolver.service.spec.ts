import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IntentType,
  Like,
  LikeStatus,
  Match,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { BlocksService } from '@modules/blocks/blocks.service';
import { MatchesService } from '@modules/matches/matches.service';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationPriority } from '@modules/notifications/enums/notification-priority.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsService } from '@modules/notifications/notifications.service';

import { LikeSummary, MatchResolverService } from '../match-resolver.service';

describe('MatchResolverService', () => {
  let service: MatchResolverService;
  let prisma: MockPrismaService;
  let matchesService: jest.Mocked<MatchesService>;
  let blocksService: jest.Mocked<BlocksService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let logger: jest.Mocked<LoggerService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  const mockNewLike: LikeSummary = {
    id: 'like-1',
    senderUserId: 'user-1',
    targetIdentityId: 'identity-2',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
    label: null,
    targetIdentity: { userId: 'user-2' },
  };

  const mockReverseLike: LikeSummary = {
    id: 'like-2',
    senderUserId: 'user-2',
    targetIdentityId: 'identity-1',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
    label: null,
    targetIdentity: { userId: 'user-1' },
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
      forContext: jest.fn().mockReturnValue(contextualLogger),
    } as unknown as jest.Mocked<LoggerService>;

    matchesService = {
      isIntentCompatible: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<MatchesService>;

    blocksService = {
      isBlocked: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<BlocksService>;

    notificationsService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        MatchResolverService,
        {
          provide: LoggerService,
          useValue: logger,
        },
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
        {
          provide: MatchesService,
          useValue: matchesService,
        },
        {
          provide: BlocksService,
          useValue: blocksService,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    service = module.get<MatchResolverService>(MatchResolverService);
    prisma = module.get(PrismaService);

    // By default, findFirst returns a mockReverseLike, mock no existing match
    prisma.like.findFirst.mockResolvedValue(mockReverseLike as unknown as Like);
    prisma.match.findUnique.mockResolvedValue(null);
    prisma.userProfile.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        const mockTx = {
          match: {
            create: jest.fn(),
            update: jest.fn(),
          },
          like: {
            update: jest.fn(),
          },
        };
        await cb(mockTx as unknown as Prisma.TransactionClient);
      },
    );
  });

  describe('resolveFromLike', () => {
    it('should return early if targetIdentity.userId is null (unresolved identity)', async () => {
      const likeMissingTarget: LikeSummary = {
        ...mockNewLike,
        label: null,
        targetIdentity: { userId: null },
      };

      await service.resolveFromLike(likeMissingTarget);

      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Target identity unresolved — skipping match resolution',
        expect.objectContaining({ likeId: 'like-1' }),
      );
      expect(prisma.like.findFirst).not.toHaveBeenCalled();
    });

    it('should return early if no reverse like is found', async () => {
      prisma.like.findFirst.mockResolvedValue(null);

      await service.resolveFromLike(mockNewLike);

      expect(prisma.like.findFirst).toHaveBeenCalledWith({
        where: {
          senderUserId: 'user-2',
          targetIdentity: { userId: 'user-1' },
          status: LikeStatus.PENDING,
          deletedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        select: {
          id: true,
          senderUserId: true,
          targetIdentityId: true,
          intent: true,
          status: true,
          label: true,
          targetIdentity: { select: { userId: true } },
        },
      });
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'No reverse like found — no match',
        expect.objectContaining({
          senderUserId: 'user-1',
          targetUserId: 'user-2',
        }),
      );
    });

    it('should return early if intents are incompatible', async () => {
      matchesService.isIntentCompatible.mockReturnValue(false);

      await service.resolveFromLike(mockNewLike);

      expect(matchesService.isIntentCompatible).toHaveBeenCalledWith(
        mockNewLike.intent,
        mockReverseLike.intent,
      );
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Intents incompatible — match suppressed',
        expect.objectContaining({ likeId: 'like-1' }),
      );
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if a block exists between users', async () => {
      blocksService.isBlocked.mockResolvedValue(true);

      await service.resolveFromLike(mockNewLike);

      expect(blocksService.isBlocked).toHaveBeenCalledWith('user-1', 'user-2');
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Block exists — match suppressed',
        expect.objectContaining({ likeId: 'like-1' }),
      );
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if an active match already exists', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: 'match-1',
        status: MatchStatus.ACTIVE,
      } as unknown as Match);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Active match already exists — duplicate prevented',
        expect.objectContaining({ likeId: 'like-1' }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute match transaction creating a new match if no match exists', async () => {
      let executedTx!: {
        match: { create: jest.Mock };
        like: { update: jest.Mock };
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          executedTx = {
            match: { create: jest.fn().mockResolvedValue({ id: 'match-1' }) },
            like: { update: jest.fn() },
          };
          return cb(executedTx as unknown as Prisma.TransactionClient);
        },
      );

      await service.resolveFromLike(mockNewLike);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(executedTx.match.create).toHaveBeenCalledWith({
        data: {
          userOneId: 'user-1', // Due to sort() user-1 comes before user-2
          userTwoId: 'user-2',
          likeOneId: 'like-1',
          likeTwoId: 'like-2',
          intentOne: IntentType.RELATIONSHIP,
          intentTwo: IntentType.RELATIONSHIP,
          status: MatchStatus.ACTIVE,
        },
      });

      expect(executedTx.like.update).toHaveBeenCalledTimes(2);
      expect(executedTx.like.update).toHaveBeenCalledWith({
        where: { id: 'like-1' },
        data: { status: LikeStatus.MATCHED },
      });
      expect(executedTx.like.update).toHaveBeenCalledWith({
        where: { id: 'like-2' },
        data: { status: LikeStatus.MATCHED },
      });
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Match resolved successfully',
        expect.objectContaining({ userOneId: 'user-1', userTwoId: 'user-2' }),
      );
      expect(notificationsService.dispatch).toHaveBeenCalledWith({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        payload: { name: 'someone', matchId: 'match-1' },
      });
      expect(notificationsService.dispatch).toHaveBeenCalledWith({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: ['user-2'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        payload: { name: 'someone', matchId: 'match-1' },
      });
    });

    it('should correctly assign canonical likes based on user IDs sorting', async () => {
      // Create a scenario where reverseLike sender comes first in sort order
      const newLikeUserB: LikeSummary = {
        ...mockNewLike,
        label: null,
        id: 'like-b',
        senderUserId: 'user-B',
        targetIdentityId: 'identity-A',
        targetIdentity: { userId: 'user-A' },
      };
      const reverseLikeUserA: LikeSummary = {
        ...mockReverseLike,
        id: 'like-a',
        senderUserId: 'user-A',
        targetIdentityId: 'identity-B',
        targetIdentity: { userId: 'user-B' },
      };

      prisma.like.findFirst.mockResolvedValue(
        reverseLikeUserA as unknown as Like,
      );

      let executedTx!: {
        match: { create: jest.Mock };
        like: { update: jest.Mock };
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          executedTx = {
            match: { create: jest.fn().mockResolvedValue({ id: 'match-1' }) },
            like: { update: jest.fn() },
          };
          return cb(executedTx as unknown as Prisma.TransactionClient);
        },
      );

      await service.resolveFromLike(newLikeUserB);

      expect(executedTx.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userOneId: 'user-A',
          userTwoId: 'user-B',
          likeOneId: 'like-a', // like from user-A
          likeTwoId: 'like-b', // like from user-B
        }),
      });
    });

    it('should execute match transaction updating an existing inactive match', async () => {
      const existingMatch = {
        id: 'existing-match-1',
        status: MatchStatus.UNMATCHED,
      };
      prisma.match.findUnique.mockResolvedValue(
        existingMatch as unknown as Match,
      );

      let executedTx!: {
        match: { update: jest.Mock };
        like: { update: jest.Mock };
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          executedTx = {
            match: { update: jest.fn().mockResolvedValue({ id: 'match-1' }) },
            like: { update: jest.fn() },
          };
          return cb(executedTx as unknown as Prisma.TransactionClient);
        },
      );

      await service.resolveFromLike(mockNewLike);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(executedTx.match.update).toHaveBeenCalledWith({
        where: { id: 'existing-match-1' },
        data: {
          likeOneId: 'like-1',
          likeTwoId: 'like-2',
          intentOne: IntentType.RELATIONSHIP,
          intentTwo: IntentType.RELATIONSHIP,
          status: MatchStatus.ACTIVE,
          deletedAt: null,
          matchedAt: expect.any(Date),
        },
      });

      expect(executedTx.like.update).toHaveBeenCalledTimes(2);
    });

    it('should catch P2002 error as a race condition warning', async () => {
      const p2002Error = new Error('Unique constraint violation');
      (p2002Error as unknown as { code: string }).code = 'P2002';

      prisma.$transaction.mockRejectedValue(p2002Error);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Race condition: match already created by concurrent resolution',
        expect.objectContaining({
          likeId: 'like-1',
          err: expect.objectContaining({
            message: p2002Error.message,
            name: p2002Error.name,
            stack: p2002Error.stack,
          }),
        }),
      );
      // Ensures it doesn't log it as an error
      expect(contextualLogger.error).not.toHaveBeenCalled();
    });

    it('should catch general errors and log them', async () => {
      const generalError = new Error('Database goes boom');

      prisma.$transaction.mockRejectedValue(generalError);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Match resolution failed',
        expect.objectContaining({
          likeId: 'like-1',
          err: expect.objectContaining({
            message: generalError.message,
            name: generalError.name,
            stack: generalError.stack,
          }),
        }),
      );
    });
  });
});

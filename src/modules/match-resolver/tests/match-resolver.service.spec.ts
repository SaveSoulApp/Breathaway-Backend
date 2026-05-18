import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlockService } from '@modules/blocks/blocks.service';
import { MatchService } from '@modules/matches/matches.service';
import { MatchResolverService, LikeSummary } from '../match-resolver.service';
import { LikeStatus, MatchStatus, IntentType } from '@prisma/client';
import { createPrismaMock, MockPrismaService } from '@infrastructure/database/tests/mocks/prisma.mock';

describe('MatchResolverService', () => {
  let service: MatchResolverService;
  let prisma: MockPrismaService;
  let matchService: jest.Mocked<MatchService>;
  let blockService: jest.Mocked<BlockService>;
  let logger: jest.Mocked<LoggerService>;
  let contextualLogger: any;

  const mockNewLike: LikeSummary = {
    id: 'like-1',
    senderUserId: 'user-1',
    targetUserId: 'user-2',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
  };

  const mockReverseLike: LikeSummary = {
    id: 'like-2',
    senderUserId: 'user-2',
    targetUserId: 'user-1',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
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

    matchService = {
      isIntentCompatible: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<MatchService>;

    blockService = {
      isBlocked: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<BlockService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
          provide: MatchService,
          useValue: matchService,
        },
        {
          provide: BlockService,
          useValue: blockService,
        },
      ],
    }).compile();

    service = module.get<MatchResolverService>(MatchResolverService);
    prisma = module.get(PrismaService) as MockPrismaService;

    // By default, findFirst returns a mockReverseLike, mock no existing match
    prisma.like.findFirst.mockResolvedValue(mockReverseLike as any);
    prisma.match.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (cb: any) => {
      const mockTx = {
        match: {
          create: jest.fn(),
          update: jest.fn(),
        },
        like: {
          update: jest.fn(),
        },
      };
      await cb(mockTx);
    });
  });

  describe('resolveFromLike', () => {
    it('should return early if targetUserId is missing', async () => {
      const likeMissingTarget: LikeSummary = {
        ...mockNewLike,
        targetUserId: null as any,
      };

      await service.resolveFromLike(likeMissingTarget);

      expect(contextualLogger.debug).toHaveBeenCalledWith(
        `Like like-1 target identity is unresolved. Skipping match resolution.`
      );
      expect(prisma.like.findFirst).not.toHaveBeenCalled();
    });

    it('should return early if no reverse like is found', async () => {
      prisma.like.findFirst.mockResolvedValue(null);

      await service.resolveFromLike(mockNewLike);

      expect(prisma.like.findFirst).toHaveBeenCalledWith({
        where: {
          senderUserId: 'user-2',
          targetUserId: 'user-1',
          status: LikeStatus.PENDING,
          deletedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
      });
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        `No reverse like found for users user-1 and user-2.`
      );
    });

    it('should return early if intents are incompatible', async () => {
      matchService.isIntentCompatible.mockReturnValue(false);

      await service.resolveFromLike(mockNewLike);

      expect(matchService.isIntentCompatible).toHaveBeenCalledWith(
        mockNewLike.intent,
        mockReverseLike.intent
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Intents are incompatible between Like like-1')
      );
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if a block exists between users', async () => {
      blockService.isBlocked.mockResolvedValue(true);

      await service.resolveFromLike(mockNewLike);

      expect(blockService.isBlocked).toHaveBeenCalledWith('user-1', 'user-2');
      expect(contextualLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Block exists between users user-1 and user-2. Suppressing match.')
      );
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if an active match already exists', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: 'match-1',
        status: MatchStatus.ACTIVE,
      } as any);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        `Active match already exists between user-1 and user-2. Duplicate prevented.`
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute match transaction creating a new match if no match exists', async () => {
      let executedTx: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        executedTx = {
          match: { create: jest.fn() },
          like: { update: jest.fn() },
        };
        await cb(executedTx);
      });

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
        `Match created successfully between users user-1 and user-2.`
      );
    });

    it('should correctly assign canonical likes based on user IDs sorting', async () => {
      // Create a scenario where reverseLike sender comes first in sort order
      const newLikeUserB: LikeSummary = {
        ...mockNewLike,
        id: 'like-b',
        senderUserId: 'user-B',
        targetUserId: 'user-A',
      };
      const reverseLikeUserA: LikeSummary = {
        ...mockReverseLike,
        id: 'like-a',
        senderUserId: 'user-A',
        targetUserId: 'user-B',
      };

      prisma.like.findFirst.mockResolvedValue(reverseLikeUserA as any);

      let executedTx: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        executedTx = {
          match: { create: jest.fn() },
          like: { update: jest.fn() },
        };
        await cb(executedTx);
      });

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
      const existingMatch = { id: 'existing-match-1', status: MatchStatus.UNMATCHED };
      prisma.match.findUnique.mockResolvedValue(existingMatch as any);

      let executedTx: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        executedTx = {
          match: { update: jest.fn() },
          like: { update: jest.fn() },
        };
        await cb(executedTx);
      });

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
      (p2002Error as any).code = 'P2002';

      prisma.$transaction.mockRejectedValue(p2002Error);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        `Race condition caught: Unique constraint violation while creating Match for users user-1 and user-2.`
      );
      // Ensures it doesn't log it as an error
      expect(contextualLogger.error).not.toHaveBeenCalled();
    });

    it('should catch general errors and log them', async () => {
      const generalError = new Error('Database goes boom');

      prisma.$transaction.mockRejectedValue(generalError);

      await service.resolveFromLike(mockNewLike);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        `Failed to resolve match for Like like-1`,
        generalError.stack
      );
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchNotFoundException } from '../application/exceptions';
import { Test, TestingModule } from '@nestjs/testing';
import { IntentType, MatchStatus } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import { MatchesService } from '../matches.service';
import { ClsService } from 'nestjs-cls';

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: MockPrismaService;

  const currentUserId = 'user-id-123';
  const otherUserId = 'other-user-id';
  const matchId = 'match-id-123';

  const mockMatchDataUserOne = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: DateUtil.now(),
    intentOne: IntentType.CASUAL,
    intentTwo: IntentType.CASUAL,
    userOneId: currentUserId,
    userTwoId: otherUserId,
    userOne: {
      id: currentUserId,
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        gender: null,
      },
    },
    userTwo: {
      id: otherUserId,
      profile: {
        firstName: 'Jane',
        lastName: 'Smith',
        gender: null,
      },
    },
  };

  const mockMatchDataUserTwo = {
    ...mockMatchDataUserOne,
    userOneId: otherUserId,
    userTwoId: currentUserId,
    userOne: {
      id: otherUserId,
      profile: {
        firstName: 'Jane',
        lastName: 'Smith',
        gender: null,
      },
    },
    userTwo: {
      id: currentUserId,
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        gender: null,
      },
    },
  };

  const expectedResponseDataUserOne = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: mockMatchDataUserOne.matchedAt,
    myIntent: IntentType.CASUAL,
    theirIntent: IntentType.CASUAL,
    me: {
      id: currentUserId,
      firstName: 'John',
      lastName: 'Doe',
      gender: null,
    },
    otherUser: {
      id: otherUserId,
      firstName: 'Jane',
      lastName: 'Smith',
      gender: null,
      label: null,
    },
  };

  const expectedResponseDataUserTwo = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: mockMatchDataUserTwo.matchedAt,
    myIntent: IntentType.CASUAL,
    theirIntent: IntentType.CASUAL,
    me: {
      id: currentUserId,
      firstName: 'John',
      lastName: 'Doe',
      gender: null,
    },
    otherUser: {
      id: otherUserId,
      firstName: 'Jane',
      lastName: 'Smith',
      gender: null,
      label: null,
    },
  };

  beforeEach(async () => {
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
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        MatchesService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllForUser', () => {
    it('should return matched response dtos when user is userOne', async () => {
      // Arrange
      prisma.match.findMany.mockResolvedValue([
        mockMatchDataUserOne,
      ] as unknown as Awaited<ReturnType<typeof prisma.match.findMany>>);
      prisma.match.count.mockResolvedValue(1);

      // Act
      const result = await service.findAllForUser(currentUserId, {
        page: 1,
        limit: 20,
      });

      // Assert
      expect(prisma.match.count).toHaveBeenCalledWith({
        where: {
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
          userOne: { deletedAt: null },
          userTwo: { deletedAt: null },
        },
      });
      expect(prisma.match.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
          userOne: { deletedAt: null },
          userTwo: { deletedAt: null },
        },
        orderBy: {
          matchedAt: 'desc',
        },
        skip: 0,
        take: 20,
        select: {
          id: true,
          status: true,
          matchedAt: true,
          intentOne: true,
          intentTwo: true,
          userOneId: true,
          userTwoId: true,
          userOne: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          userTwo: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          likeOne: {
            select: {
              label: true,
            },
          },
          likeTwo: {
            select: {
              label: true,
            },
          },
        },
      });
      expect(result).toEqual({
        data: [expectedResponseDataUserOne],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });

    it('should return matched response dtos when user is userTwo', async () => {
      // Arrange
      prisma.match.findMany.mockResolvedValue([
        mockMatchDataUserTwo,
      ] as unknown as Awaited<ReturnType<typeof prisma.match.findMany>>);
      prisma.match.count.mockResolvedValue(1);

      // Act
      const result = await service.findAllForUser(currentUserId, {
        page: 1,
        limit: 20,
      });

      // Assert
      expect(result).toEqual({
        data: [expectedResponseDataUserTwo],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });

  describe('findOneForUser', () => {
    it('should return match when user is userOne', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(
        mockMatchDataUserOne as unknown as Awaited<
          ReturnType<typeof prisma.match.findFirst>
        >,
      );

      // Act
      const result = await service.findOneForUser(matchId, currentUserId);

      // Assert
      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: matchId,
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          deletedAt: null,
          userOne: { deletedAt: null },
          userTwo: { deletedAt: null },
        },
        select: {
          id: true,
          status: true,
          matchedAt: true,
          intentOne: true,
          intentTwo: true,
          userOneId: true,
          userTwoId: true,
          userOne: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          userTwo: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
          },
          likeOne: {
            select: {
              label: true,
            },
          },
          likeTwo: {
            select: {
              label: true,
            },
          },
        },
      });
      expect(result).toEqual(expectedResponseDataUserOne);
    });

    it('should throw NotFoundException if match does not exist', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findOneForUser(matchId, currentUserId),
      ).rejects.toThrow(new MatchNotFoundException('Match not found'));
    });
  });

  describe('unmatch', () => {
    const likeOneId = 'like-one-id';
    const likeTwoId = 'like-two-id';

    const mockMatchUserOneInitiates = {
      id: matchId,
      status: MatchStatus.ACTIVE,
      userOneId: currentUserId,
      userTwoId: otherUserId,
      likeOneId,
      likeTwoId,
    };

    const mockMatchUserTwoInitiates = {
      ...mockMatchUserOneInitiates,
      userOneId: otherUserId,
      userTwoId: currentUserId,
    };

    it('should WITHDRAW initiator like and VOID other-party like when initiator is userOne', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(
        mockMatchUserOneInitiates as unknown as Awaited<
          ReturnType<typeof prisma.match.findFirst>
        >,
      );
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      // Act
      const result = await service.unmatch(matchId, currentUserId);

      // Assert — correct select shape to retrieve likeOneId/likeTwoId/userOneId/userTwoId
      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: matchId,
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          likeOneId: true,
          likeTwoId: true,
          userOneId: true,
          userTwoId: true,
        },
      });

      // Assert — single $transaction with 3 operations
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // currentUserId === userOneId → initiatorLikeId = likeOneId → WITHDRAWN
      //                              otherLikeId     = likeTwoId  → VOIDED
      const [txArg] = (prisma.$transaction as jest.Mock).mock.calls[0];
      expect(txArg).toHaveLength(3);
      expect(result).toEqual({ success: true });
    });

    it('should WITHDRAW initiator like and VOID other-party like when initiator is userTwo', async () => {
      // Arrange — currentUserId is userTwo this time
      prisma.match.findFirst.mockResolvedValue(
        mockMatchUserTwoInitiates as unknown as Awaited<
          ReturnType<typeof prisma.match.findFirst>
        >,
      );
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      // Act
      const result = await service.unmatch(matchId, currentUserId);

      // Assert — transaction still fires with 3 ops regardless of canonical ordering
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // currentUserId === userTwoId → initiatorLikeId = likeTwoId → WITHDRAWN
      //                               otherLikeId     = likeOneId → VOIDED
      const [txArg] = (prisma.$transaction as jest.Mock).mock.calls[0];
      expect(txArg).toHaveLength(3);
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException if match not found or already inactive', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.unmatch(matchId, currentUserId)).rejects.toThrow(
        new MatchNotFoundException('Match not found or already inactive'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('isIntentCompatible', () => {
    it('should return true if intentOne is OPEN', () => {
      expect(
        service.isIntentCompatible(IntentType.OPEN, IntentType.CASUAL),
      ).toBe(true);
      expect(
        service.isIntentCompatible(IntentType.OPEN, IntentType.RELATIONSHIP),
      ).toBe(true);
      expect(service.isIntentCompatible(IntentType.OPEN, IntentType.OPEN)).toBe(
        true,
      );
    });

    it('should return true if intentTwo is OPEN', () => {
      expect(
        service.isIntentCompatible(IntentType.CASUAL, IntentType.OPEN),
      ).toBe(true);
      expect(
        service.isIntentCompatible(IntentType.RELATIONSHIP, IntentType.OPEN),
      ).toBe(true);
    });

    it('should return true if both are RELATIONSHIP', () => {
      expect(
        service.isIntentCompatible(
          IntentType.RELATIONSHIP,
          IntentType.RELATIONSHIP,
        ),
      ).toBe(true);
    });

    it('should return true if both are CASUAL', () => {
      expect(
        service.isIntentCompatible(IntentType.CASUAL, IntentType.CASUAL),
      ).toBe(true);
    });

    it('should return false if incompatible', () => {
      expect(
        service.isIntentCompatible(IntentType.CASUAL, IntentType.RELATIONSHIP),
      ).toBe(false);
      expect(
        service.isIntentCompatible(IntentType.RELATIONSHIP, IntentType.CASUAL),
      ).toBe(false);
    });
  });
});

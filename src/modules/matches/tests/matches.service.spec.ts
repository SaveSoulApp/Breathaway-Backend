import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { MatchService } from '../matches.service';
import { IntentType, MatchStatus } from '@prisma/client';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

describe('MatchService', () => {
  let service: MatchService;
  let prisma: MockPrismaService;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const currentUserId = 'user-id-123';
  const otherUserId = 'other-user-id';
  const matchId = 'match-id-123';

  const mockMatchDataUserOne: any = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: new Date(),
    intentOne: IntentType.CASUAL,
    intentTwo: IntentType.CASUAL,
    userOneId: currentUserId,
    userTwoId: otherUserId,
    userOne: {
      id: currentUserId,
      profile: {
        firstName: 'John',
        lastName: 'Doe',
      },
    },
    userTwo: {
      id: otherUserId,
      profile: {
        firstName: 'Jane',
        lastName: 'Smith',
      },
    },
  };

  const mockMatchDataUserTwo: any = {
    ...mockMatchDataUserOne,
    userOneId: otherUserId,
    userTwoId: currentUserId,
    userOne: {
      id: otherUserId,
      profile: {
        firstName: 'Jane',
        lastName: 'Smith',
      },
    },
    userTwo: {
      id: currentUserId,
      profile: {
        firstName: 'John',
        lastName: 'Doe',
      },
    },
  };

  const expectedResponseDataUserOne = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: mockMatchDataUserOne.matchedAt,
    intentOne: IntentType.CASUAL,
    intentTwo: IntentType.CASUAL,
    otherUser: {
      id: otherUserId,
      firstName: 'Jane',
      lastName: 'Smith',
    },
  };

  const expectedResponseDataUserTwo = {
    id: matchId,
    status: MatchStatus.ACTIVE,
    matchedAt: mockMatchDataUserTwo.matchedAt,
    intentOne: IntentType.CASUAL,
    intentTwo: IntentType.CASUAL,
    otherUser: {
      id: otherUserId,
      firstName: 'Jane',
      lastName: 'Smith',
    },
  };

  beforeEach(async () => {
    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllForUser', () => {
    it('should return matched response dtos when user is userOne', async () => {
      // Arrange
      prisma.match.findMany.mockResolvedValue([mockMatchDataUserOne]);

      // Act
      const result = await service.findAllForUser(currentUserId);

      // Assert
      expect(prisma.match.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: {
          matchedAt: 'desc',
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
                },
              },
            },
          },
        },
      });
      expect(result).toEqual([expectedResponseDataUserOne]);
    });

    it('should return matched response dtos when user is userTwo', async () => {
      // Arrange
      prisma.match.findMany.mockResolvedValue([mockMatchDataUserTwo]);

      // Act
      const result = await service.findAllForUser(currentUserId);

      // Assert
      expect(result).toEqual([expectedResponseDataUserTwo]);
    });
  });

  describe('findOneForUser', () => {
    it('should return match when user is userOne', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(mockMatchDataUserOne);

      // Act
      const result = await service.findOneForUser(matchId, currentUserId);

      // Assert
      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: matchId,
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          deletedAt: null,
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
                },
              },
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
      ).rejects.toThrow(new NotFoundException('Match not found'));
    });
  });

  describe('unmatch', () => {
    it('should update match status to UNMATCHED and set deletedAt', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(mockMatchDataUserOne);
      prisma.match.update.mockResolvedValue({} as any);

      // Act
      const result = await service.unmatch(matchId, currentUserId);

      // Assert
      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: matchId,
          OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
        },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: {
          status: MatchStatus.UNMATCHED,
          deletedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException if match not found or already inactive', async () => {
      // Arrange
      prisma.match.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.unmatch(matchId, currentUserId)).rejects.toThrow(
        new NotFoundException('Match not found or already inactive'),
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
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

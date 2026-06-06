import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';

import { BlocksService } from '../blocks.service';
import { CreateBlockDto } from '../dto';

describe('BlocksService', () => {
  let service: BlocksService;
  let prisma: MockPrismaService;

  const userId = 'user-id-123';
  const blockedUserId = 'blocked-user-id';
  const blockId = 'block-id-123';

  const mockUser = {
    id: blockedUserId,
  } as unknown as User;

  const mockBlockData = {
    id: blockId,
    blockerUserId: userId,
    blockedUserId,
    createdAt: DateUtil.now(),
    deletedAt: null as Date | null,
    blocked: {
      id: blockedUserId,
      profile: {
        firstName: 'John',
        lastName: 'Doe',
      },
    },
  };

  const mockResponseData = {
    id: blockId,
    createdAt: mockBlockData.createdAt,
    blockedUser: {
      id: blockedUserId,
      firstName: 'John',
      lastName: 'Doe',
    },
  };

  beforeEach(async () => {
    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlocksService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<BlocksService>(BlocksService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateBlockDto = { blockedUserId };

    it('should throw BadRequestException if blocking self', async () => {
      // Act & Assert
      await expect(
        service.create(userId, { blockedUserId: userId }),
      ).rejects.toThrow(new BadRequestException('You cannot block yourself'));
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if blocked user does not exist', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(userId, createDto)).rejects.toThrow(
        new NotFoundException('User to block not found'),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: blockedUserId },
        select: { id: true },
      });
      expect(prisma.block.findUnique).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if block already exists and is active', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findUnique.mockResolvedValue(mockBlockData);

      // Act & Assert
      await expect(service.create(userId, createDto)).rejects.toThrow(
        new ConflictException('User already blocked'),
      );
      expect(prisma.block.findUnique).toHaveBeenCalledWith({
        where: {
          blockerUserId_blockedUserId: {
            blockerUserId: userId,
            blockedUserId,
          },
        },
      });
      expect(prisma.block.update).not.toHaveBeenCalled();
      expect(prisma.block.create).not.toHaveBeenCalled();
    });

    it('should reactivate soft-deleted block if it exists', async () => {
      // Arrange
      const softDeletedBlock = { ...mockBlockData, deletedAt: DateUtil.now() };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findUnique.mockResolvedValue(softDeletedBlock);
      prisma.block.update.mockResolvedValue(mockBlockData); // reactivated

      // Act
      const result = await service.create(userId, createDto);

      // Assert
      expect(prisma.block.update).toHaveBeenCalledWith({
        where: { id: softDeletedBlock.id },
        data: {
          deletedAt: null,
          createdAt: expect.any(Date),
        },
        select: {
          id: true,
          createdAt: true,
          blocked: {
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
      expect(prisma.block.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponseData);
    });

    it('should create new block if it does not exist', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.block.create.mockResolvedValue(mockBlockData);

      // Act
      const result = await service.create(userId, createDto);

      // Assert
      expect(prisma.block.create).toHaveBeenCalledWith({
        data: {
          blockerUserId: userId,
          blockedUserId,
        },
        select: {
          id: true,
          createdAt: true,
          blocked: {
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
      expect(result).toEqual(mockResponseData);
    });
  });

  describe('findAllForUser', () => {
    it('should return a mapped list of active blocked users', async () => {
      // Arrange
      prisma.block.findMany.mockResolvedValue([mockBlockData]);

      // Act
      const result = await service.findAllForUser(userId);

      // Assert
      expect(prisma.block.findMany).toHaveBeenCalledWith({
        where: {
          blockerUserId: userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          createdAt: true,
          blocked: {
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
      expect(result).toEqual([mockResponseData]);
    });
  });

  describe('findOneForUser', () => {
    it('should return mapped block if found', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue(mockBlockData);

      // Act
      const result = await service.findOneForUser(blockId, userId);

      // Assert
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          id: blockId,
          blockerUserId: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          createdAt: true,
          blocked: {
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
      expect(result).toEqual(mockResponseData);
    });

    it('should throw NotFoundException if not found', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOneForUser(blockId, userId)).rejects.toThrow(
        new NotFoundException('Block not found'),
      );
    });
  });

  describe('delete', () => {
    it('should soft delete the block if found', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue(mockBlockData);
      prisma.block.update.mockResolvedValue({
        ...mockBlockData,
        deletedAt: DateUtil.now(),
      });

      // Act
      const result = await service.delete(blockId, userId);

      // Assert
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          id: blockId,
          blockerUserId: userId,
          deletedAt: null,
        },
      });
      expect(prisma.block.update).toHaveBeenCalledWith({
        where: { id: blockId },
        data: {
          deletedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException if block not found', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(blockId, userId)).rejects.toThrow(
        new NotFoundException('Block not found'),
      );
      expect(prisma.block.update).not.toHaveBeenCalled();
    });
  });

  describe('isBlocked', () => {
    it('should return true if a block exists between userA and userB', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue({
        id: blockId,
      } as unknown as Awaited<ReturnType<typeof prisma.block.findFirst>>);

      // Act
      const result = await service.isBlocked(userId, blockedUserId);

      // Assert
      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerUserId: userId, blockedUserId: blockedUserId },
            { blockerUserId: blockedUserId, blockedUserId: userId },
          ],
          deletedAt: null,
        },
        select: { id: true },
      });
      expect(result).toBe(true);
    });

    it('should return false if no block exists', async () => {
      // Arrange
      prisma.block.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.isBlocked(userId, blockedUserId);

      // Assert
      expect(result).toBe(false);
    });
  });
});

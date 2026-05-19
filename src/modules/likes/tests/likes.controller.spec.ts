import { Test, TestingModule } from '@nestjs/testing';
import { IdentityType, IntentType, LikeStatus } from '@prisma/client';

import { LoggerService } from '@core/logger';

import {
  CreateLikeRequestDto,
  LikeListResponseDto,
  LikeResponseDto,
} from '../dto';
import { LikeController } from '../likes.controller';
import { LikeService } from '../likes.service';

describe('LikeController', () => {
  let controller: LikeController;
  let service: jest.Mocked<LikeService>;

  const userId = 'user-id-123';
  const likeId = 'like-id-123';

  const mockLikeResponse = {
    id: likeId,
    senderUserId: userId,
    targetUserId: 'target-user',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
    createdAt: new Date(),
    expiresAt: new Date(),
    targetIdentity: {
      id: 'target-identity-id',
      type: IdentityType.PHONE,
      publicValueMasked: '***-***-****',
      isVerified: true,
      verifiedAt: new Date(),
    },
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
      delete: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LikeController],
      providers: [
        { provide: LikeService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<LikeController>(LikeController);
    service = module.get(LikeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a like', async () => {
      // Arrange
      const dto: CreateLikeRequestDto = {
        targetIdentityId: 'target-identity-id',
        intent: IntentType.RELATIONSHIP,
      };
      service.create.mockResolvedValue(
        mockLikeResponse as Awaited<ReturnType<LikeService['create']>>,
      );

      // Act
      const result = await controller.create(userId, dto);

      // Assert
      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(mockLikeResponse);
    });
  });

  describe('findAll', () => {
    it('should return pending likes list', async () => {
      // Arrange
      service.findAllForUser.mockResolvedValue({
        data: [mockLikeResponse as LikeResponseDto],
      } as LikeListResponseDto);

      // Act
      const result = await controller.findAll(userId);

      // Assert
      expect(service.findAllForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ data: [mockLikeResponse] });
    });
  });

  describe('findOne', () => {
    it('should return specific like by ID', async () => {
      // Arrange
      service.findOneForUser.mockResolvedValue(
        mockLikeResponse as LikeResponseDto,
      );

      // Act
      const result = await controller.findOne(userId, likeId);

      // Assert
      expect(service.findOneForUser).toHaveBeenCalledWith(likeId, userId);
      expect(result).toEqual(mockLikeResponse);
    });
  });

  describe('remove', () => {
    it('should soft delete a pending like', async () => {
      // Arrange
      service.delete.mockResolvedValue({ success: true });

      // Act
      const result = await controller.remove(userId, likeId);

      // Assert
      expect(service.delete).toHaveBeenCalledWith(likeId, userId);
      expect(result).toEqual({ success: true });
    });
  });
});

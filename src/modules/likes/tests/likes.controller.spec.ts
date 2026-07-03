import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityType, IntentType, LikeStatus } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';

import {
  CreateLikeRequestDto,
  LikeListQueryDto,
  PaginatedLikeResponseDto,
  LikeResponseDto,
} from '../dto';
import { LikesController } from '../likes.controller';
import { LikesService } from '../likes.service';
import { ClsService } from 'nestjs-cls';

describe('LikesController', () => {
  let controller: LikesController;
  let service: jest.Mocked<LikesService>;

  const userId = 'user-id-123';
  const likeId = 'like-id-123';

  const mockLikeResponse = {
    id: likeId,
    senderUserId: userId,
    targetIdentityId: 'target-identity-id',
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
    label: null,
    createdAt: DateUtil.now(),
    expiresAt: DateUtil.now(),
    targetIdentity: {
      id: 'target-identity-id',
      type: IdentityType.PHONE,
      userId: null,
      publicValue: '+1234567890',
      isVerified: true,
      verifiedAt: DateUtil.now(),
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
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LikesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: LikesService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<LikesController>(LikesController);
    service = module.get(LikesService);
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
        mockLikeResponse as Awaited<ReturnType<LikesService['create']>>,
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
      const query: LikeListQueryDto = { page: 1, limit: 20 };
      const paginatedResponse = {
        data: [mockLikeResponse as LikeResponseDto],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      } as PaginatedLikeResponseDto;
      service.findAllForUser.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(userId, query);

      // Assert
      expect(service.findAllForUser).toHaveBeenCalledWith(userId, query);
      expect(result).toEqual(paginatedResponse);
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

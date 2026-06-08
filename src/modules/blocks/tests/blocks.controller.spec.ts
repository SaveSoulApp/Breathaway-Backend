import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { BlocksController } from '../blocks.controller';
import { BlocksService } from '../blocks.service';
import { CreateBlockDto } from '../dto';
import { ClsService } from 'nestjs-cls';

describe('BlocksController', () => {
  let controller: BlocksController;
  let service: jest.Mocked<BlocksService>;

  const userId = 'user-id-123';
  const blockId = 'block-id-123';

  const mockBlockResponse = {
    id: blockId,
    createdAt: DateUtil.now(),
    blockedUser: {
      id: 'blocked-user-id',
      firstName: 'John',
      lastName: 'Doe',
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
      controllers: [BlocksController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: BlocksService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<BlocksController>(BlocksController);
    service = module.get(BlocksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a block', async () => {
      // Arrange
      const dto: CreateBlockDto = { blockedUserId: 'blocked-user-id' };
      service.create.mockResolvedValue(mockBlockResponse);

      // Act
      const result = await controller.create(userId, dto);

      // Assert
      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(mockBlockResponse);
    });
  });

  describe('findAll', () => {
    it('should return a list of active blocked users', async () => {
      // Arrange
      service.findAllForUser.mockResolvedValue([mockBlockResponse]);

      // Act
      const result = await controller.findAll(userId);

      // Assert
      expect(service.findAllForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual([mockBlockResponse]);
    });
  });

  describe('findOne', () => {
    it('should return a specific block by ID', async () => {
      // Arrange
      service.findOneForUser.mockResolvedValue(mockBlockResponse);

      // Act
      const result = await controller.findOne(userId, blockId);

      // Assert
      expect(service.findOneForUser).toHaveBeenCalledWith(blockId, userId);
      expect(result).toEqual(mockBlockResponse);
    });
  });

  describe('remove', () => {
    it('should unblock a user (soft delete)', async () => {
      // Arrange
      service.delete.mockResolvedValue({ success: true });

      // Act
      const result = await controller.remove(userId, blockId);

      // Assert
      expect(service.delete).toHaveBeenCalledWith(blockId, userId);
      expect(result).toEqual({ success: true });
    });
  });
});

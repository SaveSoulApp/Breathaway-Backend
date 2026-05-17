import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { BlockController } from '../blocks.controller';
import { BlockService } from '../blocks.service';
import { CreateBlockDto } from '../dto';

describe('BlockController', () => {
  let controller: BlockController;
  let service: jest.Mocked<BlockService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';
  const blockId = 'block-id-123';

  const mockBlockResponse = {
    id: blockId,
    createdAt: new Date(),
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

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlockController],
      providers: [
        { provide: BlockService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<BlockController>(BlockController);
    service = module.get(BlockService) as jest.Mocked<BlockService>;
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

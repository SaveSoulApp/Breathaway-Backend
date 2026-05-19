import { LoggerService } from '@core/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityController } from '../identities.controller';
import { IdentityService } from '../identities.service';
import {
  mockCreateIdentityDto,
  mockIdentityCompleteResponse,
  mockIdentityId,
  mockIdentityResponse,
  mockUpdateIdentityDto,
  mockUserId,
} from './mocks/identities.mock';

describe('IdentityController', () => {
  let controller: IdentityController;
  let service: jest.Mocked<IdentityService>;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAllByUser: jest.fn(),
      findAllCompleteByUser: jest.fn(),
      findOne: jest.fn(),
      findOneComplete: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      verify: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        { provide: IdentityService, useValue: mockService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<IdentityController>(IdentityController);

    service = module.get(IdentityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new identity', async () => {
      // Arrange

      service.create.mockResolvedValue(mockIdentityResponse as any);

      // Act

      const result = await controller.create(
        mockUserId,
        mockCreateIdentityDto as any,
      );

      // Assert

      expect(service.create).toHaveBeenCalledWith(
        mockUserId,
        mockCreateIdentityDto,
      );
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('findAll', () => {
    it('should return all identities for a user', async () => {
      // Arrange

      service.findAllByUser.mockResolvedValue([mockIdentityResponse] as any);

      // Act
      const result = await controller.findAll(mockUserId);

      // Assert

      expect(service.findAllByUser).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual([mockIdentityResponse]);
    });
  });

  describe('findAllComplete', () => {
    it('should return all complete identities for a user', async () => {
      // Arrange

      service.findAllCompleteByUser.mockResolvedValue([
        mockIdentityCompleteResponse,
      ] as any);

      // Act
      const result = await controller.findAllComplete(mockUserId);

      // Assert

      expect(service.findAllCompleteByUser).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual([mockIdentityCompleteResponse]);
    });
  });

  describe('findOne', () => {
    it('should return a specific identity by id', async () => {
      // Arrange

      service.findOne.mockResolvedValue(mockIdentityResponse as any);

      // Act
      const result = await controller.findOne(mockUserId, mockIdentityId);

      // Assert

      expect(service.findOne).toHaveBeenCalledWith(mockIdentityId, mockUserId);
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('findOneComplete', () => {
    it('should return a specific complete identity by id', async () => {
      // Arrange

      service.findOneComplete.mockResolvedValue(
        mockIdentityCompleteResponse as any,
      );

      // Act
      const result = await controller.findOneComplete(
        mockUserId,
        mockIdentityId,
      );

      // Assert

      expect(service.findOneComplete).toHaveBeenCalledWith(
        mockIdentityId,
        mockUserId,
      );
      expect(result).toEqual(mockIdentityCompleteResponse);
    });
  });

  describe('update', () => {
    it('should update a specific identity', async () => {
      // Arrange

      service.update.mockResolvedValue(mockIdentityResponse as any);

      // Act

      const result = await controller.update(
        mockUserId,
        mockIdentityId,
        mockUpdateIdentityDto as any,
      );

      // Assert

      expect(service.update).toHaveBeenCalledWith(
        mockIdentityId,
        mockUserId,
        mockUpdateIdentityDto,
      );
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('remove', () => {
    it('should delete a specific identity', async () => {
      // Arrange

      service.delete.mockResolvedValue(undefined as any);

      // Act
      await controller.remove(mockUserId, mockIdentityId);

      // Assert

      expect(service.delete).toHaveBeenCalledWith(mockIdentityId, mockUserId);
    });
  });

  describe('verify', () => {
    it('should verify a specific identity', async () => {
      // Arrange

      service.verify.mockResolvedValue(mockIdentityResponse as any);

      // Act
      const result = await controller.verify(mockUserId, mockIdentityId);

      // Assert

      expect(service.verify).toHaveBeenCalledWith(mockIdentityId, mockUserId);
      expect(result).toEqual(mockIdentityResponse);
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import {
  CreateIdentityRequestDto,
  IdentityResponseDto,
  LookupIdentityRequestDto,
  UpdateIdentityRequestDto,
} from '../dto';
import { IdentitiesController } from '../identities.controller';
import { IdentitiesService } from '../identities.service';
import {
  mockCreateIdentityRequestDto,
  mockIdentityCompleteResponse,
  mockIdentityId,
  mockIdentityResponse,
  mockLookupIdentityDto,
  mockUpdateIdentityRequestDto,
  mockUserId,
} from './mocks/identities.mock';
import { ClsService } from 'nestjs-cls';

describe('IdentitiesController', () => {
  let controller: IdentitiesController;
  let service: jest.Mocked<IdentitiesService>;

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
      findByPublicValue: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentitiesController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: IdentitiesService, useValue: mockService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<IdentitiesController>(IdentitiesController);

    service = module.get(IdentitiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new identity', async () => {
      // Arrange

      service.create.mockResolvedValue(
        mockIdentityResponse as IdentityResponseDto,
      );

      // Act

      const result = await controller.create(
        mockUserId,
        mockCreateIdentityRequestDto as CreateIdentityRequestDto,
      );

      // Assert

      expect(service.create).toHaveBeenCalledWith(
        mockUserId,
        mockCreateIdentityRequestDto,
      );
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('findAll', () => {
    it('should return all identities for a user', async () => {
      // Arrange

      service.findAllByUser.mockResolvedValue([
        mockIdentityResponse as IdentityResponseDto,
      ]);

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
        mockIdentityCompleteResponse as Awaited<
          ReturnType<IdentitiesService['findAllCompleteByUser']>
        >[number],
      ]);

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

      service.findOne.mockResolvedValue(
        mockIdentityResponse as IdentityResponseDto,
      );

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
        mockIdentityCompleteResponse as Awaited<
          ReturnType<IdentitiesService['findOneComplete']>
        >,
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

      service.update.mockResolvedValue(
        mockIdentityResponse as IdentityResponseDto,
      );

      // Act

      const result = await controller.update(
        mockUserId,
        mockIdentityId,
        mockUpdateIdentityRequestDto as UpdateIdentityRequestDto,
      );

      // Assert

      expect(service.update).toHaveBeenCalledWith(
        mockIdentityId,
        mockUserId,
        mockUpdateIdentityRequestDto,
      );
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('remove', () => {
    it('should delete a specific identity', async () => {
      // Arrange

      service.delete.mockResolvedValue(undefined);

      // Act
      await controller.remove(mockUserId, mockIdentityId);

      // Assert

      expect(service.delete).toHaveBeenCalledWith(mockIdentityId, mockUserId);
    });
  });

  describe('verify', () => {
    it('should verify a specific identity', async () => {
      // Arrange

      service.verify.mockResolvedValue(
        mockIdentityResponse as IdentityResponseDto,
      );

      // Act
      const result = await controller.verify(mockUserId, mockIdentityId);

      // Assert

      expect(service.verify).toHaveBeenCalledWith(mockIdentityId, mockUserId);
      expect(result).toEqual(mockIdentityResponse);
    });
  });

  describe('lookup', () => {
    it('should delegate to identitiesService.findByPublicValue with correct args', async () => {
      // Arrange
      service.findByPublicValue.mockResolvedValue(
        mockIdentityCompleteResponse as Awaited<
          ReturnType<IdentitiesService['findByPublicValue']>
        >,
      );

      // Act
      const result = await controller.lookup(
        mockUserId,
        mockLookupIdentityDto as LookupIdentityRequestDto,
      );

      // Assert
      expect(service.findByPublicValue).toHaveBeenCalledWith(
        mockUserId,
        mockLookupIdentityDto,
      );
      expect(result).toEqual(mockIdentityCompleteResponse);
    });
  });
});

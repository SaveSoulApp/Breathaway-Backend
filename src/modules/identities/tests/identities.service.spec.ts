import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityService } from '../identities.service';
import {
  mockCreateIdentityDto,
  mockEncryptedData,
  mockIdentityData,
  mockIdentityId,
  mockIdentityResponse,
  mockPlatformIdData,
  mockUserId,
} from './mocks/identities.mock';

describe('IdentityService', () => {
  let service: IdentityService;
  let prisma: MockPrismaService;
  let encryption: jest.Mocked<IdentityCryptoService>;

  beforeEach(async () => {
    const mockEncryptionService = {
      processPublicValue: jest.fn(),
      processPlatformId: jest.fn(),
      decryptPublicValue: jest.fn(),
      decryptPlatformId: jest.fn(),
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
      providers: [
        IdentityService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: IdentityCryptoService, useValue: mockEncryptionService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);

    prisma = module.get(PrismaService);

    encryption = module.get(IdentityCryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create an identity', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      prisma.identity.findFirst.mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.create.mockResolvedValue(mockIdentityData as any);

      // Act

      const result = await service.create(
        mockUserId,
        mockCreateIdentityDto as any,
      );

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        mockCreateIdentityDto.publicValue,
        mockCreateIdentityDto.type,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: mockCreateIdentityDto.type,
          OR: [{ publicValueHash: mockEncryptedData.publicValueHash }],
          deletedAt: null,
        },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.create).toHaveBeenCalledWith({
        data: {
          type: mockCreateIdentityDto.type,
          userId: mockUserId,
          isVerified: false,
          ...mockEncryptedData,
        },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should successfully create an identity with platformId', async () => {
      // Arrange
      const dtoWithPlatform = {
        ...mockCreateIdentityDto,
        platformId: '12345',
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData as any);
      prisma.identity.findFirst.mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.create.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as any);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await service.create(mockUserId, dtoWithPlatform as any);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.processPlatformId).toHaveBeenCalledWith(
        dtoWithPlatform.platformId,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: dtoWithPlatform.type,
          OR: [
            { publicValueHash: mockEncryptedData.publicValueHash },
            { platformIdHash: mockPlatformIdData.platformIdHash },
          ],
          deletedAt: null,
        },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.create).toHaveBeenCalledWith({
        data: {
          type: dtoWithPlatform.type,
          userId: mockUserId,
          isVerified: false,
          ...mockEncryptedData,
          ...mockPlatformIdData,
        },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should throw ConflictException if identity already exists', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);

      // Act & Assert
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.create(mockUserId, mockCreateIdentityDto as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllByUser', () => {
    it('should return all active identities for a user', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findMany.mockResolvedValue([mockIdentityData] as any);

      // Act
      const result = await service.findAllByUser(mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockIdentityResponse]);
    });

    it('should return empty array if user has no identities', async () => {
      // Arrange
      prisma.identity.findMany.mockResolvedValue([]);

      // Act
      const result = await service.findAllByUser(mockUserId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findAllCompleteByUser', () => {
    it('should return all complete identities for a user without platformId', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findMany.mockResolvedValue([mockIdentityData] as any);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');

      // Act
      const result = await service.findAllCompleteByUser(mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.decryptPublicValue).toHaveBeenCalledWith(
        mockIdentityData.publicValueCiphertext,
        mockIdentityData.publicValueIv,
        mockIdentityData.publicValueTag,
        mockIdentityData.publicValueWrappedKey,
        mockIdentityData.publicValueKeyId,
      );
      expect(result).toEqual([
        {
          ...mockIdentityResponse,
          publicValue: 'test@example.com',
          platformId: null,
        },
      ]);
    });

    it('should return all complete identities for a user with platformId', async () => {
      // Arrange
      const identityWithPlatform = {
        ...mockIdentityData,
        ...mockPlatformIdData,
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findMany.mockResolvedValue([identityWithPlatform] as any);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');
      encryption.decryptPlatformId.mockResolvedValue('12345');

      // Act
      const result = await service.findAllCompleteByUser(mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.decryptPlatformId).toHaveBeenCalledWith(
        mockPlatformIdData.platformIdCiphertext,
        mockPlatformIdData.platformIdIv,
        mockPlatformIdData.platformIdTag,
        mockPlatformIdData.platformIdWrappedKey,
        mockPlatformIdData.platformIdKeyId,
      );
      expect(result).toEqual([
        {
          ...mockIdentityResponse,
          publicValue: 'test@example.com',
          platformId: '12345',
        },
      ]);
    });
  });

  describe('findOne', () => {
    it('should return an identity if found and owned by user', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);

      // Act
      const result = await service.findOne(mockIdentityId, mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: { id: mockIdentityId, userId: mockUserId, deletedAt: null },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should throw NotFoundException if identity not found', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(mockIdentityId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOneComplete', () => {
    it('should return complete identity if found and owned by user', async () => {
      // Arrange
      const identityWithPlatform = {
        ...mockIdentityData,
        ...mockPlatformIdData,
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(identityWithPlatform as any);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');
      encryption.decryptPlatformId.mockResolvedValue('12345');

      // Act
      const result = await service.findOneComplete(mockIdentityId, mockUserId);

      // Assert
      expect(result).toEqual({
        ...mockIdentityResponse,
        publicValue: 'test@example.com',
        platformId: '12345',
      });
    });

    it('should return complete identity without platformId', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');

      // Act
      const result = await service.findOneComplete(mockIdentityId, mockUserId);

      // Assert
      expect(result).toEqual({
        ...mockIdentityResponse,
        publicValue: 'test@example.com',
        platformId: null,
      });
    });
  });

  describe('update', () => {
    it('should return identity if neither publicValue nor platformId are provided', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        {} as any,
      );

      // Assert
      expect(result).toEqual(mockIdentityResponse);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).not.toHaveBeenCalled();
    });

    it('should successfully update publicValue', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValueOnce(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.update.mockResolvedValue(mockIdentityData as any);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as any,
      );

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        dto.publicValue,
        mockIdentityData.type,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockEncryptedData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should successfully update platformId', async () => {
      // Arrange
      const dto = { platformId: '54321' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValueOnce(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData as any);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.update.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as any);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as any,
      );

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(encryption.processPlatformId).toHaveBeenCalledWith(dto.platformId);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockPlatformIdData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should successfully update both publicValue and platformId', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com', platformId: '54321' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValueOnce(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData as any);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.update.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as any);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as any,
      );

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockEncryptedData, ...mockPlatformIdData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should throw ConflictException if updated values duplicate an existing identity', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValueOnce(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValueOnce({
        id: 'other-id',
      } as any); // Duplicate found

      // Act & Assert
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.update(mockIdentityId, mockUserId, dto as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should soft delete an identity', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.update.mockResolvedValue(mockIdentityData as any);

      // Act
      await service.delete(mockIdentityId, mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          userId: null,
        },
      });
    });
  });

  describe('verify', () => {
    it('should mark an identity as verified', async () => {
      // Arrange
      const updatedIdentity = {
        ...mockIdentityData,
        isVerified: true,
        verifiedAt: new Date(),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      prisma.identity.update.mockResolvedValue(updatedIdentity as any);

      // Act
      const result = await service.verify(mockIdentityId, mockUserId);

      // Assert
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: {
          isVerified: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          verifiedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        ...mockIdentityResponse,
        isVerified: true,
        verifiedAt: updatedIdentity.verifiedAt,
      });
    });
  });
});

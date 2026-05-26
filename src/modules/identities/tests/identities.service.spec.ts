import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Identity, IdentityType } from '@prisma/client';
import {
  CreateIdentityDto,
  LookupIdentityRequestDto,
  UpdateIdentityDto,
} from '../dto';
import { IdentityService } from '../identities.service';
import {
  mockCreateIdentityDto,
  mockEncryptedData,
  mockIdentityData,
  mockIdentityId,
  mockIdentityResponse,
  mockLookupIdentityDto,
  mockPlatformIdData,
  mockUserId,
} from './mocks/identities.mock';

describe('IdentityService', () => {
  let service: IdentityService;
  let prisma: MockPrismaService;
  let encryption: jest.Mocked<IdentityCryptoService>;
  let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
  let contextualLogger: {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const mockEncryptionService = {
      processPublicValue: jest.fn(),
      processPlatformId: jest.fn(),
      decryptPublicValue: jest.fn(),
      decryptPlatformId: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockPubSubPublisherService = {
      publish: jest.fn().mockResolvedValue('mock-message-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: IdentityCryptoService, useValue: mockEncryptionService },
        { provide: LoggerService, useValue: mockLoggerService },
        {
          provide: PubSubPublisherService,
          useValue: mockPubSubPublisherService,
        },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);

    prisma = module.get(PrismaService);
    encryption = module.get(IdentityCryptoService);
    pubSubPublisher = module.get(PubSubPublisherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create an identity', async () => {
      // Arrange

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      prisma.identity.findFirst.mockResolvedValue(null);

      prisma.identity.create.mockResolvedValue(mockIdentityData as Identity);

      // Act

      const result = await service.create(
        mockUserId,
        mockCreateIdentityDto as CreateIdentityDto,
      );

      // Assert

      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        mockCreateIdentityDto.publicValue,
        mockCreateIdentityDto.type,
      );

      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: mockCreateIdentityDto.type,
          OR: [{ publicValueHash: mockEncryptedData.publicValueHash }],
          deletedAt: null,
        },
      });

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

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);

      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValue(null);

      prisma.identity.create.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as Identity);

      // Act

      const result = await service.create(
        mockUserId,
        dtoWithPlatform as CreateIdentityDto,
      );

      // Assert

      expect(encryption.processPlatformId).toHaveBeenCalledWith(
        dtoWithPlatform.platformId,
      );

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

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);

      // Act & Assert
      await expect(
        service.create(mockUserId, mockCreateIdentityDto as CreateIdentityDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllByUser', () => {
    it('should return all active identities for a user', async () => {
      // Arrange

      prisma.identity.findMany.mockResolvedValue([
        mockIdentityData as Identity,
      ]);

      // Act
      const result = await service.findAllByUser(mockUserId);

      // Assert

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

      prisma.identity.findMany.mockResolvedValue([
        mockIdentityData as Identity,
      ]);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');

      // Act
      const result = await service.findAllCompleteByUser(mockUserId);

      // Assert

      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      expect(encryption.decryptPublicValue).toHaveBeenCalledWith({
        publicValueCiphertext: mockIdentityData.publicValueCiphertext,
        publicValueIv: mockIdentityData.publicValueIv,
        publicValueTag: mockIdentityData.publicValueTag,
        publicValueWrappedKey: mockIdentityData.publicValueWrappedKey,
        publicValueKeyId: mockIdentityData.publicValueKeyId,
      });
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

      prisma.identity.findMany.mockResolvedValue([
        identityWithPlatform as Identity,
      ]);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');
      encryption.decryptPlatformId.mockResolvedValue('12345');

      // Act
      const result = await service.findAllCompleteByUser(mockUserId);

      // Assert

      expect(encryption.decryptPlatformId).toHaveBeenCalledWith({
        platformIdCiphertext: mockPlatformIdData.platformIdCiphertext,
        platformIdIv: mockPlatformIdData.platformIdIv,
        platformIdTag: mockPlatformIdData.platformIdTag,
        platformIdWrappedKey: mockPlatformIdData.platformIdWrappedKey,
        platformIdKeyId: mockPlatformIdData.platformIdKeyId,
      });
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

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);

      // Act
      const result = await service.findOne(mockIdentityId, mockUserId);

      // Assert

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

      prisma.identity.findFirst.mockResolvedValue(
        identityWithPlatform as Identity,
      );
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

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);
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

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        {} as UpdateIdentityDto,
      );

      // Assert
      expect(result).toEqual(mockIdentityResponse);

      expect(prisma.identity.update).not.toHaveBeenCalled();
    });

    it('should successfully update publicValue', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com' };

      prisma.identity.findFirst.mockResolvedValueOnce(
        mockIdentityData as Identity,
      );

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate

      prisma.identity.update.mockResolvedValue(mockIdentityData as Identity);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as UpdateIdentityDto,
      );

      // Assert

      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        dto.publicValue,
        mockIdentityData.type,
      );

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockEncryptedData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should successfully update platformId', async () => {
      // Arrange
      const dto = { platformId: '54321' };

      prisma.identity.findFirst.mockResolvedValueOnce(
        mockIdentityData as Identity,
      );

      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate

      prisma.identity.update.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as Identity);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as UpdateIdentityDto,
      );

      // Assert

      expect(encryption.processPlatformId).toHaveBeenCalledWith(dto.platformId);

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockPlatformIdData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should successfully update both publicValue and platformId', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com', platformId: '54321' };

      prisma.identity.findFirst.mockResolvedValueOnce(
        mockIdentityData as Identity,
      );

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);

      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValueOnce(null); // No duplicate

      prisma.identity.update.mockResolvedValue({
        ...mockIdentityData,
        ...mockPlatformIdData,
      } as Identity);

      // Act

      const result = await service.update(
        mockIdentityId,
        mockUserId,
        dto as UpdateIdentityDto,
      );

      // Assert

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: { ...mockEncryptedData, ...mockPlatformIdData },
      });
      expect(result).toEqual(mockIdentityResponse);
    });

    it('should throw ConflictException if updated values duplicate an existing identity', async () => {
      // Arrange
      const dto = { publicValue: 'updated@example.com' };

      prisma.identity.findFirst.mockResolvedValueOnce(
        mockIdentityData as Identity,
      );

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);

      prisma.identity.findFirst.mockResolvedValueOnce({
        ...mockIdentityData,
        id: 'other-id',
      } as Identity); // Duplicate found

      // Act & Assert
      await expect(
        service.update(mockIdentityId, mockUserId, dto as UpdateIdentityDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should soft delete an identity', async () => {
      // Arrange

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);

      prisma.identity.update.mockResolvedValue(mockIdentityData as Identity);

      // Act
      await service.delete(mockIdentityId, mockUserId);

      // Assert

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: {
          deletedAt: expect.any(Date),
          userId: null,
        },
      });
    });

    it('should throw NotFoundException if identity not owned by user', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(mockIdentityId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.identity.update).not.toHaveBeenCalled();
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

      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);

      prisma.identity.update.mockResolvedValue(updatedIdentity as Identity);

      // Act
      const result = await service.verify(mockIdentityId, mockUserId);

      // Assert

      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: mockIdentityId },
        data: {
          isVerified: true,

          verifiedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        ...mockIdentityResponse,
        isVerified: true,
        verifiedAt: updatedIdentity.verifiedAt,
      });
    });

    it('should throw NotFoundException if identity not owned by user', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.verify(mockIdentityId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.identity.update).not.toHaveBeenCalled();
    });
  });

  describe('update — findOwnedOrFail propagation', () => {
    it('should throw NotFoundException if identity not owned by user', async () => {
      // Arrange
      prisma.identity.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(mockIdentityId, mockUserId, {
          publicValue: 'new@example.com',
        } as UpdateIdentityDto),
      ).rejects.toThrow(NotFoundException);

      expect(encryption.processPublicValue).not.toHaveBeenCalled();
      expect(prisma.identity.update).not.toHaveBeenCalled();
    });
  });

  describe('claimOrCreateIdentity', () => {
    const type = IdentityType.INSTAGRAM;
    const publicValue = 'instagram_user';
    const platformId = 'igid_123';

    it('should create a new identity when no existing record is found', async () => {
      // Arrange
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValue(null);

      const newIdentity = {
        ...mockIdentityData,
        type,
        isVerified: true,
        verifiedAt: new Date(),
        ...mockPlatformIdData,
      };
      prisma.identity.create.mockResolvedValue(newIdentity as Identity);

      // Act
      const result = await service.claimOrCreateIdentity(
        type,
        publicValue,
        platformId,
        mockUserId,
      );

      // Assert
      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        publicValue,
        type,
      );
      expect(encryption.processPlatformId).toHaveBeenCalledWith(platformId);
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type,
          publicValueHash: mockEncryptedData.publicValueHash,
          deletedAt: null,
        },
      });
      expect(prisma.identity.create).toHaveBeenCalledWith({
        data: {
          type,
          userId: mockUserId,
          isVerified: true,
          verifiedAt: expect.any(Date),
          ...mockEncryptedData,
          ...mockPlatformIdData,
        },
      });
      expect(pubSubPublisher.publish).toHaveBeenCalled();
      expect(result).toMatchObject({ isVerified: true });
    });

    it('should claim (update) an existing unclaimed identity', async () => {
      // Arrange
      const unclaimedIdentity = { ...mockIdentityData, userId: null };

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValue(
        unclaimedIdentity as unknown as Identity,
      );

      const updatedIdentity = {
        ...mockIdentityData,
        userId: mockUserId,
        isVerified: true,
        verifiedAt: new Date(),
        ...mockPlatformIdData,
      };
      prisma.identity.update.mockResolvedValue(updatedIdentity as Identity);

      // Act
      const result = await service.claimOrCreateIdentity(
        type,
        publicValue,
        platformId,
        mockUserId,
      );

      // Assert
      expect(prisma.identity.create).not.toHaveBeenCalled();
      expect(prisma.identity.update).toHaveBeenCalledWith({
        where: { id: unclaimedIdentity.id },
        data: {
          userId: mockUserId,
          isVerified: true,
          verifiedAt: expect.any(Date),
          ...mockPlatformIdData,
        },
      });
      expect(pubSubPublisher.publish).toHaveBeenCalled();
      expect(result).toMatchObject({ isVerified: true, userId: mockUserId });
    });

    it('should throw ConflictException if identity is already claimed by another user', async () => {
      // Arrange
      const claimedByOther = { ...mockIdentityData, userId: 'other-user-999' };

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValue(
        claimedByOther as unknown as Identity,
      );

      // Act & Assert
      await expect(
        service.claimOrCreateIdentity(
          type,
          publicValue,
          platformId,
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.identity.update).not.toHaveBeenCalled();
      expect(prisma.identity.create).not.toHaveBeenCalled();
      expect(pubSubPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('findByPublicValue', () => {
    it('should return complete identity without platformId when fields are absent', async () => {
      // Arrange
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      prisma.identity.findFirst.mockResolvedValue(mockIdentityData as Identity);
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');

      // Act
      const result = await service.findByPublicValue(
        mockUserId,
        mockLookupIdentityDto as LookupIdentityRequestDto,
      );

      // Assert
      expect(encryption.processPublicValue).toHaveBeenCalledWith(
        mockLookupIdentityDto.publicValue,
        mockLookupIdentityDto.type,
      );
      expect(prisma.identity.findFirst).toHaveBeenCalledWith({
        where: {
          type: mockLookupIdentityDto.type,
          publicValueHash: mockEncryptedData.publicValueHash,
          userId: mockUserId,
          deletedAt: null,
        },
      });
      expect(result).toEqual({
        ...mockIdentityResponse,
        publicValue: 'test@example.com',
        platformId: null,
      });
    });

    it('should return complete identity with decrypted platformId when fields are present', async () => {
      // Arrange
      const identityWithPlatform = {
        ...mockIdentityData,
        ...mockPlatformIdData,
      };

      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      prisma.identity.findFirst.mockResolvedValue(
        identityWithPlatform as Identity,
      );
      encryption.decryptPublicValue.mockResolvedValue('test@example.com');
      encryption.decryptPlatformId.mockResolvedValue('plat_12345');

      // Act
      const result = await service.findByPublicValue(
        mockUserId,
        mockLookupIdentityDto as LookupIdentityRequestDto,
      );

      // Assert
      expect(encryption.decryptPlatformId).toHaveBeenCalledWith({
        platformIdCiphertext: mockPlatformIdData.platformIdCiphertext,
        platformIdIv: mockPlatformIdData.platformIdIv,
        platformIdTag: mockPlatformIdData.platformIdTag,
        platformIdWrappedKey: mockPlatformIdData.platformIdWrappedKey,
        platformIdKeyId: mockPlatformIdData.platformIdKeyId,
      });
      expect(result).toEqual({
        ...mockIdentityResponse,
        publicValue: 'test@example.com',
        platformId: 'plat_12345',
      });
    });

    it('should throw NotFoundException when no identity matches', async () => {
      // Arrange
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      prisma.identity.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findByPublicValue(
          mockUserId,
          mockLookupIdentityDto as LookupIdentityRequestDto,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(encryption.decryptPublicValue).not.toHaveBeenCalled();
    });
  });

  describe('publishIdentityClaimedEvent', () => {
    it('should log an error when PubSub publish rejects, without propagating the exception', async () => {
      // Arrange — use claimOrCreateIdentity (new path) to trigger the private helper
      encryption.processPublicValue.mockResolvedValue(mockEncryptedData);
      encryption.processPlatformId.mockResolvedValue(mockPlatformIdData);
      prisma.identity.findFirst.mockResolvedValue(null);
      prisma.identity.create.mockResolvedValue(mockIdentityData as Identity);

      const pubSubError = new Error('PubSub unavailable');
      pubSubPublisher.publish.mockRejectedValue(pubSubError);

      // Act — must not throw
      await expect(
        service.claimOrCreateIdentity(
          IdentityType.INSTAGRAM,
          'ig_user',
          'igid_456',
          mockUserId,
        ),
      ).resolves.not.toThrow();

      // Allow microtask queue to drain so the fire-and-forget .catch() runs
      await Promise.resolve();

      // Assert — error logged, exception swallowed
      expect(contextualLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish'),
        expect.objectContaining({ error: pubSubError.message }),
      );
    });
  });
});

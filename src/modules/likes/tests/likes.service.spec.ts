import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Identity,
  IdentityType,
  IntentType,
  Like,
  LikeStatus,
} from '@prisma/client';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';

import { CreateLikeRequestDto } from '../dto/request/create-like.request.dto';
import { LikeService } from '../likes.service';

describe('LikeService', () => {
  let service: LikeService;
  let prisma: MockPrismaService;
  let configServiceMock: jest.Mocked<ConfigService>;
  let identityCryptoServiceMock: jest.Mocked<IdentityCryptoService>;
  let matchResolverServiceMock: jest.Mocked<MatchResolverService>;
  let loggerServiceMock: jest.Mocked<LoggerService>;

  const userId = 'user-id-123';
  const targetIdentityId = 'target-identity-id';
  const targetUserId = 'target-user-id';
  const likeId = 'like-id-123';

  const mockTargetIdentity: Identity = {
    id: targetIdentityId,
    userId: targetUserId,
    type: IdentityType.PHONE,
    publicValueHash: 'hash',
    publicValueCiphertext: 'enc',
    publicValueIv: 'iv-value-char-length-24--',
    publicValueTag: 'tag-value-char-length-24',
    publicValueWrappedKey: 'wrapped-key',
    publicValueKeyId: 'key-id',
    publicValueMasked: '***',
    platformIdHash: null,
    platformIdCiphertext: null,
    platformIdIv: null,
    platformIdTag: null,
    platformIdWrappedKey: null,
    platformIdKeyId: null,
    isVerified: true,
    verifiedAt: new Date(),
    createdAt: new Date(),
    deletedAt: null,
  };

  const mockLikeData = {
    id: likeId,
    senderUserId: userId,
    targetIdentityId,
    targetUserId,
    intent: IntentType.RELATIONSHIP,
    status: LikeStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    expiresAt: new Date(),
    targetIdentity: mockTargetIdentity,
  } as unknown as Like & { targetIdentity: Identity };

  beforeEach(async () => {
    configServiceMock = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown): unknown => {
          if (key === 'LIKE_EXPIRY_DAYS') return 90;
          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    identityCryptoServiceMock = {
      processPublicValue: jest.fn(),
      processPlatformId: jest.fn(),
    } as unknown as jest.Mocked<IdentityCryptoService>;

    matchResolverServiceMock = {
      resolveFromLike: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MatchResolverService>;

    loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        error: jest.fn(),
      }),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikeService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: IdentityCryptoService, useValue: identityCryptoServiceMock },
        { provide: MatchResolverService, useValue: matchResolverServiceMock },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<LikeService>(LikeService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dtoWithId: CreateLikeRequestDto = {
      targetIdentityId,
      intent: IntentType.RELATIONSHIP,
    };

    it('should throw BadRequestException if neither targetIdentityId nor targetIdentity is provided', async () => {
      // Act & Assert
      await expect(
        service.create(userId, { intent: IntentType.RELATIONSHIP }),
      ).rejects.toThrow(
        new BadRequestException(
          'Either targetIdentityId or targetIdentity must be provided',
        ),
      );
    });

    it('should handle creating like via targetIdentity object (existing identity)', async () => {
      // Arrange
      const dtoWithObj: CreateLikeRequestDto = {
        intent: IntentType.RELATIONSHIP,
        targetIdentity: { type: IdentityType.PHONE, publicValue: '1234567890' },
      };

      const processValueData = {
        publicValueHash: 'hash',
        publicValueEncrypted: 'enc',
        publicValueMasked: 'mask',
      };
      identityCryptoServiceMock.processPublicValue.mockResolvedValue(
        processValueData as unknown as Awaited<
          ReturnType<IdentityCryptoService['processPublicValue']>
        >,
      );
      prisma.identity.findUnique
        .mockResolvedValueOnce(mockTargetIdentity) // Finding by type_publicValueHash
        .mockResolvedValueOnce(mockTargetIdentity); // Finding by ID

      prisma.like.findFirst.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue(mockLikeData);

      // Act
      const result = await service.create(userId, dtoWithObj);

      // Assert
      expect(identityCryptoServiceMock.processPublicValue).toHaveBeenCalledWith(
        '1234567890',
        'PHONE',
      );
      expect(prisma.identity.findUnique).toHaveBeenNthCalledWith(1, {
        where: {
          type_publicValueHash: { type: 'PHONE', publicValueHash: 'hash' },
        },
      });
      expect(prisma.like.create).toHaveBeenCalled();
      expect(result).toEqual(mockLikeData);
    });

    it('should handle creating like via targetIdentity object (new identity)', async () => {
      // Arrange
      const dtoWithObj: CreateLikeRequestDto = {
        intent: IntentType.RELATIONSHIP,
        targetIdentity: {
          type: IdentityType.PHONE,
          publicValue: '1234567890',
          platformId: 'platform123',
        },
      };

      const processValueData = {
        publicValueHash: 'hash',
        publicValueEncrypted: 'enc',
        publicValueMasked: 'mask',
      };
      const processPlatformData = {
        platformIdHash: 'phash',
        platformIdEncrypted: 'penc',
      };

      identityCryptoServiceMock.processPublicValue.mockResolvedValue(
        processValueData as unknown as Awaited<
          ReturnType<IdentityCryptoService['processPublicValue']>
        >,
      );
      identityCryptoServiceMock.processPlatformId.mockResolvedValue(
        processPlatformData as unknown as Awaited<
          ReturnType<IdentityCryptoService['processPlatformId']>
        >,
      );

      prisma.identity.findUnique
        .mockResolvedValueOnce(null) // Not existing
        .mockResolvedValueOnce(mockTargetIdentity); // Finding by new ID

      prisma.identity.create.mockResolvedValue(mockTargetIdentity);
      prisma.like.findFirst.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue(mockLikeData);

      // Act
      const result = await service.create(userId, dtoWithObj);

      // Assert
      expect(identityCryptoServiceMock.processPlatformId).toHaveBeenCalledWith(
        'platform123',
      );
      expect(prisma.identity.create).toHaveBeenCalledWith({
        data: {
          type: 'PHONE',
          isVerified: false,
          userId: null,
          ...processValueData,
          ...processPlatformData,
        },
      });
      expect(result).toEqual(mockLikeData);
    });

    it('should throw NotFoundException if target identity not found', async () => {
      // Arrange
      prisma.identity.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(userId, dtoWithId)).rejects.toThrow(
        new NotFoundException('Target identity not found'),
      );
    });

    it('should throw BadRequestException if trying to like self', async () => {
      // Arrange
      prisma.identity.findUnique.mockResolvedValue({
        ...mockTargetIdentity,
        userId,
      });

      // Act & Assert
      await expect(service.create(userId, dtoWithId)).rejects.toThrow(
        new BadRequestException('You cannot like yourself'),
      );
    });

    it('should throw ConflictException if already liked', async () => {
      // Arrange
      prisma.identity.findUnique.mockResolvedValue(mockTargetIdentity);
      prisma.like.findFirst.mockResolvedValue(mockLikeData);

      // Act & Assert
      await expect(service.create(userId, dtoWithId)).rejects.toThrow(
        new ConflictException({ message: 'You already liked this person' }),
      );
    });

    it('should create like and trigger match resolver asynchronously', async () => {
      // Arrange
      prisma.identity.findUnique.mockResolvedValue(mockTargetIdentity);
      prisma.like.findFirst.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue(mockLikeData);

      // Act
      const result = await service.create(userId, dtoWithId);

      // Assert
      expect(prisma.like.create).toHaveBeenCalledWith({
        data: {
          senderUserId: userId,
          targetIdentityId,
          targetUserId,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          expiresAt: expect.any(Date),
        },
        select: expect.any(Object),
      });
      expect(matchResolverServiceMock.resolveFromLike).toHaveBeenCalledWith(
        mockLikeData,
      );
      expect(result).toEqual(mockLikeData);
    });

    it('should log error if match resolver fails', async () => {
      // Arrange
      prisma.identity.findUnique.mockResolvedValue(mockTargetIdentity);
      prisma.like.findFirst.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue(mockLikeData);

      const error = new Error('Resolve error');
      matchResolverServiceMock.resolveFromLike.mockRejectedValue(error);

      // Act
      await service.create(userId, dtoWithId);

      // Let event loop drain for promise rejection handling
      await new Promise(process.nextTick.bind(process));

      // Assert
      expect(
        loggerServiceMock.forContext('LikeService').error,
      ).toHaveBeenCalled();
    });
  });

  describe('findAllForUser', () => {
    it('should return pending likes', async () => {
      // Arrange
      prisma.like.findMany.mockResolvedValue([mockLikeData]);

      // Act
      const result = await service.findAllForUser(userId);

      // Assert
      expect(prisma.like.findMany).toHaveBeenCalledWith({
        where: {
          senderUserId: userId,
          status: LikeStatus.PENDING,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result).toEqual({ data: [mockLikeData] });
    });
  });

  describe('findOneForUser', () => {
    it('should return like if found', async () => {
      // Arrange
      prisma.like.findFirst.mockResolvedValue(mockLikeData);

      // Act
      const result = await service.findOneForUser(likeId, userId);

      // Assert
      expect(prisma.like.findFirst).toHaveBeenCalledWith({
        where: {
          id: likeId,
          senderUserId: userId,
          deletedAt: null,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockLikeData);
    });

    it('should throw NotFoundException if not found', async () => {
      // Arrange
      prisma.like.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOneForUser(likeId, userId)).rejects.toThrow(
        new NotFoundException(`Like ${likeId} not found`),
      );
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if like not found', async () => {
      // Arrange
      prisma.like.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(likeId, userId)).rejects.toThrow(
        new NotFoundException(`Like ${likeId} not found`),
      );
    });

    it('should throw BadRequestException if like is not PENDING', async () => {
      // Arrange
      prisma.like.findFirst.mockResolvedValue({
        ...mockLikeData,
        status: LikeStatus.MATCHED,
      });

      // Act & Assert
      await expect(service.delete(likeId, userId)).rejects.toThrow(
        new BadRequestException('Only PENDING likes can be deleted'),
      );
    });

    it('should soft delete like', async () => {
      // Arrange
      prisma.like.findFirst.mockResolvedValue(mockLikeData);
      prisma.like.update.mockResolvedValue({
        ...mockLikeData,
        deletedAt: new Date(),
        status: LikeStatus.DELETED,
      });

      // Act
      const result = await service.delete(likeId, userId);

      // Assert
      expect(prisma.like.update).toHaveBeenCalledWith({
        where: { id: likeId },
        data: {
          deletedAt: expect.any(Date),
          status: LikeStatus.DELETED,
        },
      });
      expect(result).toEqual({ success: true });
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialType, IdentityType, User } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { AccountAlreadyExistsException } from '../application/exceptions';
import { AuthCredentialService } from '../services/auth-credential.service';
import { AuthMethod } from '../utils/auth-method.utils';

describe('AuthCredentialService', () => {
  let service: AuthCredentialService;
  let prisma: MockPrismaService;
  let encryptionService: { processPublicValue: jest.Mock };
  let pubSubPublisher: { publish: jest.Mock };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  const mockUser: User = {
    id: 'user-new-1',
    countryCode: 'US',
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockPublicValueData = {
    publicValueHash: 'hash-123',
    publicValueMasked: '***456',
    publicValueEncrypted: Buffer.from('encrypted'),
    keyId: 'key-v1',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    encryptionService = {
      processPublicValue: jest.fn().mockResolvedValue(mockPublicValueData),
    };
    pubSubPublisher = {
      publish: jest.fn().mockResolvedValue('msg-id-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCredentialService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: IdentityCryptoService, useValue: encryptionService },
        { provide: PubSubPublisherService, useValue: pubSubPublisher },
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
      ],
    }).compile();

    service = module.get<AuthCredentialService>(AuthCredentialService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUserWithCredential', () => {
    it('should provision new user, identity, and credential when no identity exists', async () => {
      // Arrange
      const mockTx = {
        user: { create: jest.fn().mockResolvedValue(mockUser) },
        identity: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'identity-new-1' }),
        },
        authCredential: { create: jest.fn().mockResolvedValue({}) },
      };

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(mockTx as any),
      );

      // Act
      const result = await service.createUserWithCredential(
        '+15551234567',
        AuthMethod.PHONE,
        true,
        'US',
      );

      // Assert
      expect(result.user).toEqual(mockUser);
      expect(result.normalizedHash).toBe('hash-123');
      expect(mockTx.user.create).toHaveBeenCalledWith({
        data: {
          countryCode: 'US',
          notificationPreference: { create: {} },
        },
      });
      expect(mockTx.identity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: IdentityType.PHONE,
          userId: 'user-new-1',
          isVerified: true,
          publicValueHash: 'hash-123',
        }),
      });
      expect(mockTx.authCredential.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-new-1',
          type: AuthCredentialType.PHONE,
          isPrimary: true,
          identityId: 'identity-new-1',
        }),
      });
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.USER_PROVISIONED,
        expect.objectContaining({ userId: 'user-new-1' }),
      );
    });

    it('should claim ghost identity and publish IDENTITY_CLAIMED event', async () => {
      // Arrange
      const existingGhost = {
        id: 'ghost-identity-id',
        userId: null,
      };

      const mockTx = {
        user: { create: jest.fn().mockResolvedValue(mockUser) },
        identity: {
          findUnique: jest.fn().mockResolvedValue(existingGhost),
          update: jest.fn().mockResolvedValue({ id: 'ghost-identity-id' }),
        },
        authCredential: { create: jest.fn().mockResolvedValue({}) },
      };

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(mockTx as any),
      );

      // Act
      const result = await service.createUserWithCredential(
        'user@example.com',
        AuthMethod.EMAIL,
        false,
      );

      // Assert
      expect(result.user).toEqual(mockUser);
      expect(mockTx.identity.update).toHaveBeenCalledWith({
        where: { id: 'ghost-identity-id' },
        data: expect.objectContaining({
          userId: 'user-new-1',
          isVerified: false,
        }),
      });
      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.IDENTITY_CLAIMED,
        { userId: 'user-new-1' },
      );
    });

    it('should throw AccountAlreadyExistsException when identity is already claimed by registered user', async () => {
      // Arrange
      const existingClaimed = {
        id: 'claimed-identity-id',
        userId: 'existing-registered-user',
      };

      const mockTx = {
        user: { create: jest.fn().mockResolvedValue(mockUser) },
        identity: {
          findUnique: jest.fn().mockResolvedValue(existingClaimed),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(mockTx as any),
      );

      // Act & Assert
      await expect(
        service.createUserWithCredential('+15550009999', AuthMethod.PHONE),
      ).rejects.toThrow(AccountAlreadyExistsException);
    });

    it('should log error and rethrow when unexpected database error occurs', async () => {
      // Arrange
      const dbError = new Error('Prisma transaction failure');
      prisma.$transaction.mockRejectedValue(dbError);

      // Act & Assert
      await expect(
        service.createUserWithCredential('+15550009999', AuthMethod.PHONE),
      ).rejects.toThrow(dbError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'User provisioning transaction failed',
        expect.objectContaining({ step: 'provision_user' }),
      );
    });
  });

  describe('toCredentialType', () => {
    it('should map PHONE method to AuthCredentialType.PHONE', () => {
      expect(service.toCredentialType(AuthMethod.PHONE)).toBe(
        AuthCredentialType.PHONE,
      );
    });

    it('should map EMAIL method to AuthCredentialType.EMAIL', () => {
      expect(service.toCredentialType(AuthMethod.EMAIL)).toBe(
        AuthCredentialType.EMAIL,
      );
    });
  });
});

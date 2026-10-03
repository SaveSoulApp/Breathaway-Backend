import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialType, IdentityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { NotificationRecipientResolverService } from '../../recipient/notification-recipient-resolver.service';

describe('NotificationRecipientResolverService', () => {
  let service: NotificationRecipientResolverService;
  let mockPrisma: {
    authCredential: { findMany: jest.Mock };
    identity: { findMany: jest.Mock };
  };
  let mockCryptoService: {
    decryptPublicValue: jest.Mock;
  };

  const mockContextualLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  const mockLogger = {
    forContext: jest.fn().mockReturnValue(mockContextualLogger),
  };

  const fakeIdentity1 = {
    publicValueCiphertext: 'cipher-1',
    publicValueIv: 'iv-1',
    publicValueTag: 'tag-1',
    publicValueWrappedKey: 'key-1',
    publicValueKeyId: 'kid-1',
  };

  const fakeIdentity2 = {
    publicValueCiphertext: 'cipher-2',
    publicValueIv: 'iv-2',
    publicValueTag: 'tag-2',
    publicValueWrappedKey: 'key-2',
    publicValueKeyId: 'kid-2',
  };

  beforeEach(async () => {
    mockPrisma = {
      authCredential: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      identity: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockCryptoService = {
      decryptPublicValue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRecipientResolverService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdentityCryptoService, useValue: mockCryptoService },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<NotificationRecipientResolverService>(
      NotificationRecipientResolverService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveEmails', () => {
    it('should return an empty map if userIds is empty', async () => {
      const result = await service.resolveEmails([]);
      expect(result.size).toBe(0);
      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
    });

    it('should resolve and decrypt emails from AuthCredential', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Alice' } },
        },
        {
          userId: 'user-2',
          identity: fakeIdentity2,
          user: { profile: { firstName: 'Bob' } },
        },
      ]);

      mockCryptoService.decryptPublicValue
        .mockResolvedValueOnce('Alice@EXAMPLE.com ')
        .mockResolvedValueOnce('bob@example.com');

      const result = await service.resolveEmails(['user-1', 'user-2']);

      expect(mockPrisma.authCredential.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-1', 'user-2'] },
          type: AuthCredentialType.EMAIL,
          deletedAt: null,
        },
        include: {
          identity: {
            select: {
              publicValueCiphertext: true,
              publicValueIv: true,
              publicValueTag: true,
              publicValueWrappedKey: true,
              publicValueKeyId: true,
            },
          },
          user: {
            select: {
              profile: {
                select: {
                  firstName: true,
                },
              },
            },
          },
        },
      });

      expect(result.size).toBe(2);
      expect(result.get('user-1')).toEqual({
        userId: 'user-1',
        email: 'alice@example.com',
        firstName: 'Alice',
      });
      expect(result.get('user-2')).toEqual({
        userId: 'user-2',
        email: 'bob@example.com',
        firstName: 'Bob',
      });
    });

    it('should fallback to verified Identity when user has no AuthCredential', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Alice' } },
        },
      ]);
      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        'alice@example.com',
      );

      mockPrisma.identity.findMany.mockResolvedValue([
        {
          userId: 'user-2',
          publicValueCiphertext: fakeIdentity2.publicValueCiphertext,
          publicValueIv: fakeIdentity2.publicValueIv,
          publicValueTag: fakeIdentity2.publicValueTag,
          publicValueWrappedKey: fakeIdentity2.publicValueWrappedKey,
          publicValueKeyId: fakeIdentity2.publicValueKeyId,
          user: { profile: { firstName: 'Bob' } },
        },
      ]);
      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        'bob@example.com',
      );

      const result = await service.resolveEmails(['user-1', 'user-2']);

      expect(mockPrisma.identity.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-2'] },
          type: IdentityType.EMAIL,
          isVerified: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          publicValueCiphertext: true,
          publicValueIv: true,
          publicValueTag: true,
          publicValueWrappedKey: true,
          publicValueKeyId: true,
          user: {
            select: {
              profile: {
                select: {
                  firstName: true,
                },
              },
            },
          },
        },
      });

      expect(result.size).toBe(2);
      expect(result.get('user-1')?.email).toBe('alice@example.com');
      expect(result.get('user-2')?.email).toBe('bob@example.com');
    });

    it('should gracefully handle decryption error for individual user without crashing', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Alice' } },
        },
        {
          userId: 'user-2',
          identity: fakeIdentity2,
          user: { profile: { firstName: 'Bob' } },
        },
      ]);

      mockCryptoService.decryptPublicValue
        .mockRejectedValueOnce(new Error('KMS error'))
        .mockResolvedValueOnce('bob@example.com');

      mockPrisma.identity.findMany.mockResolvedValue([]);

      const result = await service.resolveEmails(['user-1', 'user-2']);

      expect(result.size).toBe(1);
      expect(result.has('user-1')).toBe(false);
      expect(result.get('user-2')?.email).toBe('bob@example.com');
      expect(mockContextualLogger.error).toHaveBeenCalledWith(
        'Failed to decrypt user email address from AuthCredential',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('resolvePhoneNumbers', () => {
    it('should return an empty map if userIds is empty', async () => {
      const result = await service.resolvePhoneNumbers([]);
      expect(result.size).toBe(0);
      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
    });

    it('should resolve, decrypt, and normalize phone numbers from AuthCredential', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Charlie' } },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+91 98765 43210',
      );

      const result = await service.resolvePhoneNumbers(['user-1']);

      expect(result.size).toBe(1);
      expect(result.get('user-1')).toEqual({
        userId: 'user-1',
        phoneDigits: '919876543210',
        e164Formatted: '+919876543210',
        firstName: 'Charlie',
      });
    });

    it('should fallback to verified Identity for remaining users', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([]);

      mockPrisma.identity.findMany.mockResolvedValue([
        {
          userId: 'user-2',
          publicValueCiphertext: fakeIdentity2.publicValueCiphertext,
          publicValueIv: fakeIdentity2.publicValueIv,
          publicValueTag: fakeIdentity2.publicValueTag,
          publicValueWrappedKey: fakeIdentity2.publicValueWrappedKey,
          publicValueKeyId: fakeIdentity2.publicValueKeyId,
          user: { profile: { firstName: 'Diana' } },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce('14155552671');

      const result = await service.resolvePhoneNumbers(['user-2']);

      expect(mockPrisma.identity.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-2'] },
          type: IdentityType.PHONE,
          isVerified: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          publicValueCiphertext: true,
          publicValueIv: true,
          publicValueTag: true,
          publicValueWrappedKey: true,
          publicValueKeyId: true,
          user: {
            select: {
              profile: {
                select: {
                  firstName: true,
                },
              },
            },
          },
        },
      });

      expect(result.size).toBe(1);
      expect(result.get('user-2')).toEqual({
        userId: 'user-2',
        phoneDigits: '14155552671',
        e164Formatted: '+14155552671',
        firstName: 'Diana',
      });
    });

    it('should fallback to regex digit extraction if libphonenumber fails but length >= 7', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-3',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Evan' } },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce('9876543210');

      const result = await service.resolvePhoneNumbers(['user-3']);

      expect(result.size).toBe(1);
      expect(result.get('user-3')).toEqual({
        userId: 'user-3',
        phoneDigits: '9876543210',
        e164Formatted: '+9876543210',
        firstName: 'Evan',
      });
    });

    it('should ignore invalid or too short phone numbers', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-4',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Frank' } },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce('123');

      const result = await service.resolvePhoneNumbers(['user-4']);

      expect(result.size).toBe(0);
    });

    it('should log warning and continue when decrypting phone fails', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-5',
          identity: fakeIdentity1,
          user: { profile: { firstName: 'Grace' } },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockRejectedValueOnce(
        new Error('Decryption failed'),
      );

      const result = await service.resolvePhoneNumbers(['user-5']);

      expect(result.size).toBe(0);
      expect(mockContextualLogger.warn).toHaveBeenCalledWith(
        'Failed to decrypt user phone from AuthCredential',
        expect.objectContaining({ userId: 'user-5' }),
      );
    });
  });
});

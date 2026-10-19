import { PassThrough } from 'stream';

import archiver from 'archiver';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DsarExportStatus, IdentityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { BigQueryAuditService } from '@infrastructure/bigquery/bigquery-audit.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { GcpStorageService } from '@infrastructure/storage/gcp-storage.service';
import { ChatsService } from '@modules/chats/chats.service';

import { DSAR_EXPORT_COMPLETED_EVENT } from '../events';
import { DsarExportWorkerService } from '../services/dsar-export-worker.service';

jest.mock('archiver-zip-encrypted', () => jest.fn());

jest.mock('archiver', () => {
  const createMockArchive = () => {
    const pt = new PassThrough();
    return {
      append: jest.fn(),
      pipe: jest.fn((dest) => pt.pipe(dest)),
      on: jest.fn((event, cb) => pt.on(event, cb)),
      finalize: jest.fn().mockImplementation(() => {
        pt.end();
        return Promise.resolve();
      }),
    };
  };

  const archiverFn = jest.fn(() => createMockArchive());
  (archiverFn as unknown as Record<string, unknown>).create = jest.fn(() =>
    createMockArchive(),
  );
  (archiverFn as unknown as Record<string, unknown>).isRegisteredFormat = jest
    .fn()
    .mockReturnValue(false);
  (archiverFn as unknown as Record<string, unknown>).registerFormat = jest.fn();

  return {
    __esModule: true,
    default: archiverFn,
    ...archiverFn,
  };
});

describe('DsarExportWorkerService', () => {
  let worker: DsarExportWorkerService;
  let prisma: jest.Mocked<PrismaService>;
  let chatsService: jest.Mocked<ChatsService>;
  let identityCryptoService: jest.Mocked<IdentityCryptoService>;
  let storageService: jest.Mocked<GcpStorageService>;
  let bigQueryAuditService: jest.Mocked<BigQueryAuditService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const userId = '01JB0Z9G4K3V8W2N7Q1M9P6R5U';
  const exportId = '01JB0Z9G4K3V8W2N7Q1M9P6R5T';

  beforeEach(async () => {
    const mockPrisma = {
      dsarExport: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: DsarExportStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          countryCode: 'IN',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          profile: {
            firstName: 'enc:v1:test-first',
            lastName: 'enc:v1:test-last',
            dateOfBirth: new Date('1995-05-15'),
            gender: 'MALE',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
        }),
      },
      identity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'id-1',
            type: IdentityType.PHONE,
            isVerified: true,
            verifiedAt: new Date(),
            createdAt: new Date(),
            publicValueCiphertext: 'mock-cipher',
            publicValueIv: 'mock-iv',
            publicValueTag: 'mock-tag',
            publicValueWrappedKey: 'mock-key',
            publicValueKeyId: 'key-1',
            platformIdCiphertext: null,
            platformIdIv: null,
            platformIdTag: null,
            platformIdWrappedKey: null,
            platformIdKeyId: null,
          },
        ]),
      },
      authCredential: {
        findMany: jest.fn().mockResolvedValue([
          {
            type: 'PHONE',
            valueMasked: '+91••••9999',
            isPrimary: true,
            createdAt: new Date(),
          },
        ]),
      },
      device: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dev-1',
            platform: 'IOS',
            deviceModel: 'iPhone 15',
            osVersion: '17.2',
            appVersion: '1.2.0',
            lastActiveAt: new Date(),
            createdAt: new Date(),
          },
        ]),
      },
      userSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            plan: { name: 'Premium Monthly', code: 'PREMIUM_1M' },
            status: 'ACTIVE',
            storePlatform: 'APP_STORE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(),
            autoRenewing: true,
            pricePaid: 499,
            currencyCode: 'INR',
            countryCode: 'IN',
            cancelledAt: null,
            expiresAt: new Date(),
            createdAt: new Date(),
          },
        ]),
      },
      paymentOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      creditLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cred-1',
            amount: 10,
            type: 'CREDIT',
            source: 'PURCHASE',
            balanceAfter: 10,
            expiresAt: new Date(),
            createdAt: new Date(),
          },
        ]),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'notif-1',
            type: 'WELCOME',
            category: 'SYSTEM',
            priority: 'NORMAL',
            title: 'Welcome to BreathAway',
            body: 'Welcome aboard!',
            action: null,
            link: null,
            isRead: true,
            readAt: new Date(),
            createdAt: new Date(),
          },
        ]),
      },
      consentLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cons-1',
            channel: 'EMAIL',
            consentGranted: true,
            source: 'SIGNUP',
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            createdAt: new Date(),
          },
        ]),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({
          inAppEnabled: true,
          emailEnabled: true,
          pushEnabled: true,
          whatsappEnabled: true,
          updatedAt: new Date(),
        }),
      },
      like: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockChatsService = {
      exportChatHistory: jest.fn().mockResolvedValue([
        {
          roomId: 'room-1',
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: 'msg-1',
              isSender: true,
              content: 'Hello there!',
              sentAt: new Date().toISOString(),
              readAt: null,
            },
          ],
        },
      ]),
    };

    const mockIdentityCryptoService = {
      decryptText: jest.fn().mockImplementation((val: string) => {
        if (val === 'enc:v1:test-first') return Promise.resolve('Alice');
        if (val === 'enc:v1:test-last') return Promise.resolve('Smith');
        return Promise.resolve(val);
      }),
      decryptPublicValue: jest.fn().mockResolvedValue('+919876543210'),
      decryptPlatformId: jest.fn().mockResolvedValue('oauth-uid-123'),
    };

    const mockStorage = {
      createWriteStream: jest.fn().mockImplementation(() => {
        const stream = new PassThrough();
        // Emits finish automatically when input ends
        return stream;
      }),
    };

    const mockBigQuery = {
      queryUserAuditLogs: jest.fn().mockResolvedValue([
        {
          publish_time: new Date().toISOString(),
          actionType: 'user.login',
          data: { userId },
        },
      ]),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'DSAR_EXPORT_BUCKET_NAME') return 'breathaway-dsar-exports';
        if (key === 'DSAR_EXPORT_RETENTION_DAYS') return 7;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DsarExportWorkerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatsService, useValue: mockChatsService },
        { provide: IdentityCryptoService, useValue: mockIdentityCryptoService },
        { provide: GcpStorageService, useValue: mockStorage },
        { provide: BigQueryAuditService, useValue: mockBigQuery },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    worker = module.get<DsarExportWorkerService>(DsarExportWorkerService);
    prisma = module.get(PrismaService);
    chatsService = module.get(ChatsService);
    identityCryptoService = module.get(IdentityCryptoService);
    storageService = module.get(GcpStorageService);
    bigQueryAuditService = module.get(BigQueryAuditService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  describe('processExport', () => {
    it('should extract data across all datastores, stream archive, update COMPLETED, and emit event', async () => {
      await worker.processExport(exportId, userId, 'TestPassphrase123!');

      // Check state transitions
      expect(prisma.dsarExport.update).toHaveBeenCalledWith({
        where: { id: exportId },
        data: { status: DsarExportStatus.PROCESSING },
      });

      // Check decryption
      expect(identityCryptoService.decryptText).toHaveBeenCalledWith(
        'enc:v1:test-first',
      );
      expect(identityCryptoService.decryptPublicValue).toHaveBeenCalled();

      // Check chats & bigquery
      expect(chatsService.exportChatHistory).toHaveBeenCalledWith(userId);
      expect(bigQueryAuditService.queryUserAuditLogs).toHaveBeenCalledWith(
        userId,
      );

      // Check stream creation to GCS
      expect(storageService.createWriteStream).toHaveBeenCalledWith(
        'breathaway-dsar-exports',
        `exports/${userId}/${exportId}.zip`,
        'application/zip',
        { userId, exportId },
      );

      // Check encrypted archive configuration enforces AES-256
      expect(archiver.create).toHaveBeenCalledWith(
        'zip-encrypted',
        expect.objectContaining({
          encryptionMethod: 'aes256',
          password: 'TestPassphrase123!',
        }),
      );

      // Check database update to COMPLETED
      expect(prisma.dsarExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: exportId },
          data: expect.objectContaining({
            status: DsarExportStatus.COMPLETED,
            storagePath: `exports/${userId}/${exportId}.zip`,
            checksumSha256: expect.any(String),
          }),
        }),
      );

      // Check domain event emission
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DSAR_EXPORT_COMPLETED_EVENT,
        expect.objectContaining({
          userId,
          exportId,
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('should update record to FAILED if a critical error occurs during extraction', async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection lost'),
      );

      await worker.processExport(exportId, userId);

      expect(prisma.dsarExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: exportId },
          data: expect.objectContaining({
            status: DsarExportStatus.FAILED,
            errorMessage: 'Database connection lost',
          }),
        }),
      );
    });

    it('should return early without processing if export record is not found', async () => {
      (prisma.dsarExport.findUnique as jest.Mock).mockResolvedValue(null);

      await worker.processExport(exportId, userId);

      expect(prisma.dsarExport.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should return early without processing if export record is already COMPLETED (idempotency)', async () => {
      (prisma.dsarExport.findUnique as jest.Mock).mockResolvedValue({
        status: DsarExportStatus.COMPLETED,
      });

      await worker.processExport(exportId, userId);

      expect(prisma.dsarExport.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleDsarExportRequested', () => {
    it('should invoke processExport when invoked by Pub/Sub push listener', async () => {
      const processSpy = jest
        .spyOn(worker, 'processExport')
        .mockResolvedValue();

      await worker.handleDsarExportRequested(
        { exportId, userId, passphrase: 'Pass' },
        'msg-456',
      );

      expect(processSpy).toHaveBeenCalledWith(exportId, userId, 'Pass');
    });
  });
});

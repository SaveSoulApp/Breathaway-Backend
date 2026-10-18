import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DsarExport, DsarExportStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { GcpStorageService } from '@infrastructure/storage/gcp-storage.service';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { DsarExportService } from '../services/dsar-export.service';

describe('DsarExportService', () => {
  let service: DsarExportService;
  let prisma: jest.Mocked<PrismaService>;
  let pubSubPublisher: jest.Mocked<PubSubPublisherService>;
  let storageService: jest.Mocked<GcpStorageService>;

  const userId = '01JB0Z9G4K3V8W2N7Q1M9P6R5U';
  const exportId = '01JB0Z9G4K3V8W2N7Q1M9P6R5T';

  const mockUser = {
    id: userId,
    deletedAt: null,
  };

  const mockExportRecord: DsarExport = {
    id: exportId,
    userId,
    status: DsarExportStatus.PENDING,
    storagePath: null,
    fileSizeBytes: null,
    checksumSha256: null,
    errorMessage: null,
    requestedAt: new Date('2026-10-18T12:00:00Z'),
    completedAt: null,
    expiresAt: null,
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      dsarExport: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockPubSub = {
      publish: jest.fn(),
    };

    const mockStorage = {
      getSignedDownloadUrl: jest.fn(),
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
        if (key === 'DSAR_EXPORT_COOLDOWN_HOURS') return 24;
        if (key === 'DSAR_SIGNED_URL_TTL_MINUTES') return 60;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DsarExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PubSubPublisherService, useValue: mockPubSub },
        { provide: GcpStorageService, useValue: mockStorage },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<DsarExportService>(DsarExportService);
    prisma = module.get(PrismaService);
    pubSubPublisher = module.get(PubSubPublisherService);
    storageService = module.get(GcpStorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestExport', () => {
    it('should throw NotFoundException if user does not exist or is soft-deleted', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.requestExport(userId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if an export is already PENDING or PROCESSING', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.dsarExport.findFirst as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );

      await expect(service.requestExport(userId, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return existing completed export if requested within the 24-hour cooldown', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      // No active pending/processing
      (prisma.dsarExport.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        // Returns recent completed export
        .mockResolvedValueOnce({
          ...mockExportRecord,
          status: DsarExportStatus.COMPLETED,
          storagePath: `exports/${userId}/${exportId}.zip`,
          requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days remaining
        });

      storageService.getSignedDownloadUrl.mockResolvedValue(
        'https://storage.googleapis.com/test-signed-url',
      );

      const result = await service.requestExport(userId, {});

      expect(result.status).toBe(DsarExportStatus.COMPLETED);
      expect(result.downloadUrl).toBe(
        'https://storage.googleapis.com/test-signed-url',
      );
      expect(pubSubPublisher.publish).not.toHaveBeenCalled();
    });

    it('should bypass the cooldown window and trigger fresh export if force is true', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      // No active pending/processing
      (prisma.dsarExport.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.dsarExport.create as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );
      pubSubPublisher.publish.mockResolvedValue('msg-123' as unknown as never);

      const result = await service.requestExport(userId, {
        force: true,
        passphrase: 'ForcedNewPassphrase123!',
      });

      expect(result.id).toBe(exportId);
      expect(result.status).toBe(DsarExportStatus.PENDING);
      expect(result.passphrase).toBe('ForcedNewPassphrase123!');
      expect(pubSubPublisher.publish).toHaveBeenCalled();
    });

    it('should create a PENDING record, publish Pub/Sub event, and return passphrase', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.dsarExport.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.dsarExport.create as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );
      pubSubPublisher.publish.mockResolvedValue('msg-123' as unknown as never);

      const result = await service.requestExport(userId, {
        passphrase: 'MyCustomPassphrase123!',
      });

      expect(result.id).toBe(exportId);
      expect(result.status).toBe(DsarExportStatus.PENDING);
      expect(result.passphrase).toBe('MyCustomPassphrase123!');
      expect(pubSubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.DSAR_EXPORT,
        PubSubEvent.DSAR_EXPORT_REQUESTED,
        expect.objectContaining({
          exportId,
          userId,
          passphrase: 'MyCustomPassphrase123!',
        }),
        expect.objectContaining({ userId, exportId }),
      );
    });

    it('should generate a 16-character passphrase if none was provided', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.dsarExport.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.dsarExport.create as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );
      pubSubPublisher.publish.mockResolvedValue('msg-123' as unknown as never);

      const result = await service.requestExport(userId, {});

      expect(result.passphrase).toBeDefined();
      expect(result.passphrase?.length).toBe(16);
    });

    it('should update record to FAILED and rethrow if Pub/Sub publishing fails', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.dsarExport.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.dsarExport.create as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );
      pubSubPublisher.publish.mockRejectedValue(
        new Error('Pub/Sub unavailable'),
      );

      await expect(service.requestExport(userId, {})).rejects.toThrow(
        'Pub/Sub unavailable',
      );

      expect(prisma.dsarExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: exportId },
          data: expect.objectContaining({ status: DsarExportStatus.FAILED }),
        }),
      );
    });
  });

  describe('getLatestExport', () => {
    it('should throw NotFoundException if no export record exists', async () => {
      (prisma.dsarExport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getLatestExport(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return export with downloadUrl: null when status is PENDING', async () => {
      (prisma.dsarExport.findFirst as jest.Mock).mockResolvedValue(
        mockExportRecord,
      );

      const result = await service.getLatestExport(userId);

      expect(result.id).toBe(exportId);
      expect(result.status).toBe(DsarExportStatus.PENDING);
      expect(result.downloadUrl).toBeNull();
      expect(storageService.getSignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('should dynamically mint a signed URL when status is COMPLETED and still valid', async () => {
      (prisma.dsarExport.findFirst as jest.Mock).mockResolvedValue({
        ...mockExportRecord,
        status: DsarExportStatus.COMPLETED,
        storagePath: `exports/${userId}/${exportId}.zip`,
        fileSizeBytes: BigInt(2048),
        checksumSha256: 'mock-checksum',
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days remaining
      });
      storageService.getSignedDownloadUrl.mockResolvedValue(
        'https://storage.googleapis.com/on-demand-signed-url',
      );

      const result = await service.getLatestExport(userId);

      expect(result.status).toBe(DsarExportStatus.COMPLETED);
      expect(result.downloadUrl).toBe(
        'https://storage.googleapis.com/on-demand-signed-url',
      );
      expect(result.fileSizeBytes).toBe(2048);
      expect(storageService.getSignedDownloadUrl).toHaveBeenCalledWith(
        'breathaway-dsar-exports',
        `exports/${userId}/${exportId}.zip`,
        60,
      );
    });
  });
});

import { randomBytes } from 'crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DsarExport, DsarExportStatus } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { GcpStorageService } from '@infrastructure/storage/gcp-storage.service';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { DsarExportResponseDto, RequestDsarExportRequestDto } from '../dto';

/**
 * Service orchestrating user DSAR data portability export requests.
 *
 * Enforces strict user verification, 24-hour rate limiting / cooldown,
 * secure random passphrase generation, and immediate non-blocking 202 dispatch.
 */
@Injectable()
export class DsarExportService extends BaseService {
  private readonly bucketName: string;
  private readonly cooldownHours: number;
  private readonly signedUrlTtlMinutes: number;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pubSubPublisher: PubSubPublisherService,
    private readonly storageService: GcpStorageService,
  ) {
    super(logger);
    const configuredBucket = this.configService.get<string>(
      'DSAR_EXPORT_BUCKET_NAME',
    );
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    this.bucketName =
      configuredBucket ??
      (projectId ? `${projectId}-dsar-exports` : 'breathaway-dsar-exports');
    this.cooldownHours = Number(
      this.configService.get<number>('DSAR_EXPORT_COOLDOWN_HOURS') ?? 24,
    );
    this.signedUrlTtlMinutes = Number(
      this.configService.get<number>('DSAR_SIGNED_URL_TTL_MINUTES') ?? 60,
    );
  }

  /**
   * Initiates a new DSAR data export request for the authenticated user.
   *
   * Validates user existence, enforces single-active-request mutex and a 24-hour
   * cooldown. Creates a PENDING DsarExport row and publishes an asynchronous Pub/Sub
   * job, returning immediately with the export metadata and the encryption passphrase.
   *
   * @param userId - Unique identifier of the authenticated user.
   * @param dto - Optional user-defined passphrase.
   * @returns DsarExportResponseDto with status PENDING and the generated/supplied passphrase.
   * @throws {NotFoundException} If user is not found or soft-deleted.
   * @throws {ConflictException} If another export is currently in progress.
   */
  async requestExport(
    userId: string,
    dto: RequestDsarExportRequestDto,
  ): Promise<DsarExportResponseDto> {
    const ctx = { userId, step: 'request_export' };
    this.logger.info('Received DSAR data export request', ctx);

    // 1. Verify user exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      this.logger.warn(
        'Export requested for non-existent or deleted user',
        ctx,
      );
      throw new NotFoundException('User account not found or deleted');
    }

    // 2. Concurrency & Cooldown Checks
    const activeExport = await this.prisma.dsarExport.findFirst({
      where: {
        userId,
        status: { in: [DsarExportStatus.PENDING, DsarExportStatus.PROCESSING] },
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (activeExport) {
      this.logger.warn('Concurrent export request rejected', {
        step: 'request_export_concurrent_rejected',
        userId,
        activeExportId: activeExport.id,
      });
      throw new ConflictException(
        'A data export request is currently in progress. Please check back shortly.',
      );
    }

    const now = new Date();

    // Check 24-hour cooldown on completed exports (bypassed if dto.force is true)
    if (!dto.force) {
      const latestCompleted = await this.prisma.dsarExport.findFirst({
        where: {
          userId,
          status: DsarExportStatus.COMPLETED,
        },
        orderBy: { requestedAt: 'desc' },
      });

      if (latestCompleted && latestCompleted.expiresAt) {
        const cooldownThreshold = new Date(
          latestCompleted.requestedAt.getTime() +
            this.cooldownHours * 60 * 60 * 1000,
        );

        // If within cooldown and the file is still active, return the existing export
        if (now < cooldownThreshold && latestCompleted.expiresAt > now) {
          this.logger.info(
            'Export requested within cooldown window; returning existing active export',
            {
              ...ctx,
              existingExportId: latestCompleted.id,
            },
          );
          let downloadUrl: string | null = null;
          if (latestCompleted.storagePath) {
            try {
              downloadUrl = await this.storageService.getSignedDownloadUrl(
                this.bucketName,
                latestCompleted.storagePath,
                this.signedUrlTtlMinutes,
              );
            } catch {
              downloadUrl = null;
            }
          }
          return this.mapToResponseDto(latestCompleted, null, downloadUrl);
        }
      }
    }

    // 3. Resolve or generate AES-256 encryption passphrase
    const passphrase =
      dto.passphrase?.trim() ||
      randomBytes(12).toString('base64url').slice(0, 16);

    // 4. Create PENDING export record in database
    const exportRecord = await this.prisma.dsarExport.create({
      data: {
        userId,
        status: DsarExportStatus.PENDING,
        requestedAt: now,
      },
    });

    // 5. Publish asynchronous job to Pub/Sub
    try {
      await this.pubSubPublisher.publish(
        PubSubTopic.DSAR_EXPORT,
        PubSubEvent.DSAR_EXPORT_REQUESTED,
        {
          exportId: exportRecord.id,
          userId,
          passphrase,
        },
        { userId, exportId: exportRecord.id },
      );

      this.logger.info('Published DSAR export job to Pub/Sub', {
        ...ctx,
        exportId: exportRecord.id,
      });
    } catch (err: unknown) {
      this.logger.error('Failed to publish DSAR export job to Pub/Sub', {
        step: 'publish_dsar_export_job_error',
        userId,
        exportId: exportRecord.id,
        err: serializeError(err),
      });

      // Update record to FAILED if publish failed
      await this.prisma.dsarExport.update({
        where: { id: exportRecord.id },
        data: {
          status: DsarExportStatus.FAILED,
          errorMessage: 'Failed to queue export job',
          completedAt: new Date(),
        },
      });

      throw err;
    }

    return this.mapToResponseDto(exportRecord, passphrase, null);
  }

  /**
   * Retrieves the latest DSAR export record for the authenticated user.
   *
   * If the export is COMPLETED and still within its 7-day retention window,
   * dynamically mints a fresh, short-lived V4 signed download URL (1 hour).
   *
   * @param userId - Unique identifier of the authenticated user.
   * @returns DsarExportResponseDto with current status and downloadUrl.
   * @throws {NotFoundException} If no export request exists for this user.
   */
  async getLatestExport(userId: string): Promise<DsarExportResponseDto> {
    const ctx = { userId, step: 'get_latest_export' };

    const exportRecord = await this.prisma.dsarExport.findFirst({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });

    if (!exportRecord) {
      this.logger.debug('No export record found for user', ctx);
      throw new NotFoundException('No export request found for this account');
    }

    let downloadUrl: string | null = null;
    const now = new Date();

    if (
      exportRecord.status === DsarExportStatus.COMPLETED &&
      exportRecord.storagePath &&
      exportRecord.expiresAt &&
      exportRecord.expiresAt > now
    ) {
      try {
        downloadUrl = await this.storageService.getSignedDownloadUrl(
          this.bucketName,
          exportRecord.storagePath,
          this.signedUrlTtlMinutes,
        );
      } catch (err: unknown) {
        this.logger.error(
          'Failed to mint signed download URL for completed export',
          {
            step: 'mint_signed_url_error',
            userId,
            exportId: exportRecord.id,
            err: serializeError(err),
          },
        );
      }
    }

    return this.mapToResponseDto(exportRecord, null, downloadUrl);
  }

  private mapToResponseDto(
    record: DsarExport,
    passphrase?: string | null,
    downloadUrl?: string | null,
  ): DsarExportResponseDto {
    return {
      id: record.id,
      userId: record.userId,
      status: record.status,
      passphrase: passphrase ?? null,
      downloadUrl: downloadUrl ?? null,
      fileSizeBytes: record.fileSizeBytes ? Number(record.fileSizeBytes) : null,
      checksumSha256: record.checksumSha256 ?? null,
      requestedAt: record.requestedAt,
      completedAt: record.completedAt ?? null,
      expiresAt: record.expiresAt ?? null,
    };
  }
}

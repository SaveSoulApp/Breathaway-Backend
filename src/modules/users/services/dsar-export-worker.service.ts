import { createHash } from 'crypto';
import { PassThrough } from 'stream';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DsarExportStatus } from '@prisma/client';
import archiver, { Archiver, ArchiverOptions } from 'archiver';
import archiverZipEncrypted from 'archiver-zip-encrypted';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { BigQueryAuditService } from '@infrastructure/bigquery/bigquery-audit.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { GcpStorageService } from '@infrastructure/storage/gcp-storage.service';
import { ChatsService } from '@modules/chats/chats.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';

import {
  DSAR_EXPORT_COMPLETED_EVENT,
  DsarExportCompletedEvent,
} from '../events';

/**
 * Background worker service reacting to Pub/Sub events to extract, decrypt,
 * package, and upload DSAR data archives directly to Google Cloud Storage.
 */
@Injectable()
export class DsarExportWorkerService extends BaseService {
  private readonly bucketName: string;
  private readonly retentionDays: number;
  private readonly encryptionMethod: 'zip20' | 'aes256';

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
    private readonly identityCryptoService: IdentityCryptoService,
    private readonly storageService: GcpStorageService,
    private readonly bigQueryAuditService: BigQueryAuditService,
  ) {
    super(logger);
    const configuredBucket = this.configService.get<string>(
      'DSAR_EXPORT_BUCKET_NAME',
    );
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    this.bucketName =
      configuredBucket ??
      (projectId ? `${projectId}-dsar-exports` : 'breathaway-dsar-exports');
    this.retentionDays = Number(
      this.configService.get<number>('DSAR_EXPORT_RETENTION_DAYS') ?? 7,
    );
    this.encryptionMethod =
      this.configService.get<'zip20' | 'aes256'>(
        'DSAR_EXPORT_ENCRYPTION_METHOD',
      ) ?? 'zip20';

    if (!archiver.isRegisteredFormat('zip-encrypted')) {
      archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
    }
  }

  /**
   * Pub/Sub event listener for DSAR export requests.
   *
   * @param data - Job payload containing exportId, userId, and optional encryption passphrase.
   * @param messageId - Pub/Sub message ID for tracing.
   */
  @PubSubListener(PubSubEvent.DSAR_EXPORT_REQUESTED)
  async handleDsarExportRequested(
    data: { exportId: string; userId: string; passphrase?: string },
    messageId: string,
  ): Promise<void> {
    const { exportId, userId, passphrase } = data;
    const ctx = { exportId, userId, messageId, step: 'pubsub_dsar_export' };
    this.logger.info('Received DSAR export background job from Pub/Sub', ctx);

    await this.processExport(exportId, userId, passphrase);
  }

  /**
   * Executes the end-to-end data extraction, decryption, ZIP archive streaming,
   * Cloud Storage upload, and domain event notification.
   *
   * Modular design: Can be invoked either via Pub/Sub push listener or a Cloud Run Job runner.
   *
   * @param exportId - ULID of the DsarExport database record.
   * @param userId - ULID of the user.
   * @param passphrase - Passphrase for AES-256 ZIP encryption.
   */
  async processExport(
    exportId: string,
    userId: string,
    passphrase?: string,
  ): Promise<void> {
    const ctx = { exportId, userId, step: 'process_export' };

    // 1. Transition state to PROCESSING
    await this.prisma.dsarExport.update({
      where: { id: exportId },
      data: { status: DsarExportStatus.PROCESSING },
    });

    try {
      this.logger.info('Starting multi-store personal data extraction', ctx);

      // 2. Extract and Decrypt Data
      const [
        userWithProfile,
        identities,
        credentials,
        devices,
        subscriptions,
        paymentOrders,
        transactions,
        creditLedger,
        notifications,
        consents,
        preferences,
        likes,
        matches,
        blocks,
        chatRooms,
        auditLogs,
      ] = await Promise.all([
        this.extractUserAndProfile(userId),
        this.extractIdentities(userId),
        this.prisma.authCredential.findMany({
          where: { userId },
          select: {
            type: true,
            valueMasked: true,
            isPrimary: true,
            createdAt: true,
          },
        }),
        this.prisma.device.findMany({
          where: { userId },
          select: {
            id: true,
            platform: true,
            deviceId: true,
            appVersion: true,
            isActive: true,
            createdAt: true,
          },
        }),
        this.prisma.userSubscription.findMany({
          where: { userId },
          select: {
            id: true,
            plan: { select: { name: true, slug: true } },
            status: true,
            storePlatform: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            autoRenewing: true,
            pricePaid: true,
            currencyCode: true,
            countryCode: true,
            cancelledAt: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.paymentOrder.findMany({
          where: { userId },
          select: {
            id: true,
            plan: { select: { name: true, slug: true } },
            amount: true,
            originalAmount: true,
            discountAmount: true,
            currency: true,
            gateway: true,
            status: true,
            gatewayOrderId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.transaction.findMany({
          where: { userId },
          select: {
            id: true,
            gateway: true,
            gatewayTransactionId: true,
            type: true,
            status: true,
            channel: true,
            productId: true,
            creditsGranted: true,
            amount: true,
            currency: true,
            occurredAt: true,
            createdAt: true,
          },
          orderBy: { occurredAt: 'desc' },
        }),
        this.prisma.creditLedger.findMany({
          where: { userId },
          select: {
            id: true,
            amount: true,
            transactionType: true,
            source: true,
            referenceId: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.notification.findMany({
          where: { userId },
          select: {
            id: true,
            type: true,
            category: true,
            priority: true,
            title: true,
            body: true,
            action: true,
            link: true,
            isRead: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.consentLedger.findMany({
          where: { userId },
          select: {
            id: true,
            channel: true,
            consentGranted: true,
            source: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.notificationPreference.findUnique({
          where: { userId },
          select: {
            pushEnabled: true,
            whatsappEnabled: true,
            smsEnabled: true,
            emailEnabled: true,
            updatedAt: true,
          },
        }),
        this.prisma.like.findMany({
          where: { senderUserId: userId },
          select: {
            id: true,
            intent: true,
            status: true,
            label: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.match.findMany({
          where: { OR: [{ userOneId: userId }, { userTwoId: userId }] },
          select: {
            id: true,
            status: true,
            matchedAt: true,
            updatedAt: true,
          },
          orderBy: { matchedAt: 'desc' },
        }),
        this.prisma.block.findMany({
          where: { blockerUserId: userId },
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.chatsService.exportChatHistory(userId),
        this.bigQueryAuditService.queryUserAuditLogs(userId),
      ]);

      this.logger.info('Extracted personal data across all datastores', {
        ...ctx,
        chatRoomsCount: chatRooms.length,
        auditLogsCount: auditLogs.length,
      });

      // 3. Prepare Archive & Streaming Pipeline to Google Cloud Storage
      const destinationPath = `exports/${userId}/${exportId}.zip`;
      const passThrough = new PassThrough();
      const hash = createHash('sha256');
      let fileSizeBytes = 0;

      passThrough.on('data', (chunk: Buffer) => {
        fileSizeBytes += chunk.length;
        hash.update(chunk);
      });

      const gcsWriteStream = this.storageService.createWriteStream(
        this.bucketName,
        destinationPath,
        'application/zip',
        { userId, exportId },
      );

      const uploadPromise = new Promise<void>((resolve, reject) => {
        gcsWriteStream.on('finish', () => resolve());
        gcsWriteStream.on('error', (err) => reject(err));
        passThrough.on('error', (err) => reject(err));
      });

      passThrough.pipe(gcsWriteStream);

      // Create streaming ZIP archive (password-protected if passphrase provided)
      let archive: Archiver;
      if (passphrase) {
        if (!archiver.isRegisteredFormat('zip-encrypted')) {
          archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
        }
        archive = archiver.create('zip-encrypted', {
          zlib: { level: 9 },
          encryptionMethod: this.encryptionMethod,
          password: passphrase,
        } as ArchiverOptions);
      } else {
        archive = archiver.create('zip', {
          zlib: { level: 9 },
        });
      }

      archive.on('error', (err) => {
        passThrough.destroy(err);
      });

      archive.pipe(passThrough);

      // 4. Assemble Archive Files
      archive.append(JSON.stringify(userWithProfile, null, 2), {
        name: 'profile.json',
      });

      archive.append(
        JSON.stringify({ identities, authCredentials: credentials }, null, 2),
        { name: 'identities.json' },
      );

      archive.append(JSON.stringify(devices, null, 2), {
        name: 'devices.json',
      });

      archive.append(JSON.stringify(subscriptions, null, 2), {
        name: 'subscriptions.json',
      });

      archive.append(JSON.stringify({ paymentOrders, transactions }, null, 2), {
        name: 'orders_and_transactions.json',
      });

      archive.append(JSON.stringify(creditLedger, null, 2), {
        name: 'credits_ledger.json',
      });

      archive.append(JSON.stringify(notifications, null, 2), {
        name: 'notifications.json',
      });

      archive.append(JSON.stringify({ consents, preferences }, null, 2), {
        name: 'consents_and_preferences.json',
      });

      archive.append(
        JSON.stringify(
          {
            likesSent: likes,
            matches: matches.map((m) => ({
              id: m.id,
              status: m.status,
              matchedAt: m.matchedAt,
              updatedAt: m.updatedAt,
              counterpart: 'Counterpart User (identity redacted)',
            })),
            blocks: blocks.map((b) => ({
              id: b.id,
              createdAt: b.createdAt,
              status: 'BLOCKED',
            })),
          },
          null,
          2,
        ),
        { name: 'interactions.json' },
      );

      // Append individual chat room transcripts
      for (const room of chatRooms) {
        archive.append(JSON.stringify(room, null, 2), {
          name: `chats/room_${room.roomId}.json`,
        });
      }

      archive.append(JSON.stringify(auditLogs, null, 2), {
        name: 'audit_logs.json',
      });

      // Append manifest and README documentation
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000,
      );

      const manifest = {
        exportId,
        userId,
        generatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        archiveFormat: passphrase
          ? `Password-Protected ZIP Archive (${this.encryptionMethod.toUpperCase()})`
          : 'Standard ZIP Archive',
        legalBasis:
          'GDPR Article 15 (Right of Access), GDPR Article 20 (Data Portability), CCPA § 1798.110',
        contact: 'privacy@breathaway.app',
        files: [
          'manifest.json',
          'profile.json',
          'identities.json',
          'devices.json',
          'subscriptions.json',
          'orders_and_transactions.json',
          'credits_ledger.json',
          'notifications.json',
          'consents_and_preferences.json',
          'interactions.json',
          'audit_logs.json',
          'README.txt',
          ...chatRooms.map((r) => `chats/room_${r.roomId}.json`),
        ],
      };

      archive.append(JSON.stringify(manifest, null, 2), {
        name: 'manifest.json',
      });

      const readmeContent = `BreathAway Personal Data Archive
=================================
Export ID:    ${exportId}
Generated At: ${now.toUTCString()}
Expires At:   ${expiresAt.toUTCString()}
Archive Type: ${passphrase ? `Password-Protected ZIP (${this.encryptionMethod.toUpperCase()})` : 'Standard ZIP'}

This archive contains a machine-readable export of all personal data
associated with your BreathAway account in accordance with GDPR Article 15/20
and CCPA § 1798.110.

${
  passphrase
    ? `Decryption Instructions:
------------------------
This archive is encrypted and password-protected. When extracting files using
your operating system (macOS Archive Utility, Windows Explorer, iOS Files,
or Linux unzip), you will be prompted for your archive passphrase. Enter the
passphrase you received upon initiating your export request.
`
    : ''
}
File Descriptions:
------------------
- profile.json: Account identifiers, display names, and demographic details.
- identities.json: Phone numbers, emails, and social identities linked to your account.
- devices.json: Registered mobile and web devices, app versions, and activity logs.
- subscriptions.json: Subscription plans, billing cycles, pricing, and status.
- orders_and_transactions.json: Inbound payment orders and gateway transaction records.
- credits_ledger.json: Historical ledger of all credit additions, uses, and expirations.
- notifications.json: In-app notifications history, read receipts, and categories.
- consents_and_preferences.json: Marketing/communication consents and notification settings.
- interactions.json: Sent likes, matches, and blocks (counterpart PII redacted).
- chats/: Decrypted transcripts of chat conversations you participated in.
- audit_logs.json: Security, authentication, and compliance audit trail.

Security Notice:
----------------
This export file will be automatically purged from Cloud Storage on:
${expiresAt.toUTCString()}.

If you have any questions or concerns regarding your privacy or personal data,
please contact the BreathAway Privacy Team at privacy@breathaway.app.
`;

      archive.append(readmeContent, { name: 'README.txt' });

      // Finalize and await upload stream completion
      await archive.finalize();
      await uploadPromise;

      const checksumSha256 = hash.digest('hex');

      this.logger.info('Completed DSAR archive upload to Cloud Storage', {
        ...ctx,
        fileSizeBytes,
        checksumSha256,
        destinationPath,
      });

      // 5. Update Database Record to COMPLETED
      await this.prisma.dsarExport.update({
        where: { id: exportId },
        data: {
          status: DsarExportStatus.COMPLETED,
          storagePath: destinationPath,
          fileSizeBytes: BigInt(fileSizeBytes),
          checksumSha256,
          completedAt: now,
          expiresAt,
        },
      });

      // 6. Emit Decoupled Domain Event
      this.eventEmitter.emit(
        DSAR_EXPORT_COMPLETED_EVENT,
        new DsarExportCompletedEvent(userId, exportId, expiresAt),
      );

      this.logger.info('Emitted DSAR_EXPORT_COMPLETED_EVENT', ctx);
    } catch (err: unknown) {
      this.logger.error('Failed to process DSAR export job', {
        step: 'process_export_failure',
        userId,
        exportId,
        err: serializeError(err),
      });

      await this.prisma.dsarExport.update({
        where: { id: exportId },
        data: {
          status: DsarExportStatus.FAILED,
          errorMessage:
            err instanceof Error
              ? err.message
              : 'Unknown export processing error',
          completedAt: new Date(),
        },
      });
    }
  }

  private async extractUserAndProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        countryCode: true,
        createdAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    let firstName = '';
    let lastName: string | null = null;

    if (user.profile?.firstName) {
      firstName =
        (await this.identityCryptoService.decryptText(
          user.profile.firstName,
        )) ?? '';
    }
    if (user.profile?.lastName) {
      lastName = await this.identityCryptoService.decryptText(
        user.profile.lastName,
      );
    }

    return {
      id: user.id,
      countryCode: user.countryCode,
      accountCreatedAt: user.createdAt,
      profile: user.profile
        ? {
            firstName,
            lastName,
            dateOfBirth: user.profile.dateOfBirth,
            gender: user.profile.gender,
            profileCreatedAt: user.profile.createdAt,
            profileUpdatedAt: user.profile.updatedAt,
          }
        : null,
    };
  }

  private async extractIdentities(userId: string) {
    const identities = await this.prisma.identity.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        isVerified: true,
        verifiedAt: true,
        createdAt: true,
        publicValueCiphertext: true,
        publicValueIv: true,
        publicValueTag: true,
        publicValueWrappedKey: true,
        publicValueKeyId: true,
        platformIdCiphertext: true,
        platformIdIv: true,
        platformIdTag: true,
        platformIdWrappedKey: true,
        platformIdKeyId: true,
      },
    });

    const decrypted = [];

    for (const identity of identities) {
      let identifier: string | null = null;
      let platformId: string | null = null;

      try {
        identifier = await this.identityCryptoService.decryptPublicValue({
          publicValueCiphertext: identity.publicValueCiphertext,
          publicValueIv: identity.publicValueIv,
          publicValueTag: identity.publicValueTag,
          publicValueWrappedKey: identity.publicValueWrappedKey,
          publicValueKeyId: identity.publicValueKeyId,
        });
      } catch {
        identifier = '[Decryption failed]';
      }

      if (
        identity.platformIdCiphertext &&
        identity.platformIdIv &&
        identity.platformIdTag &&
        identity.platformIdWrappedKey &&
        identity.platformIdKeyId
      ) {
        try {
          platformId = await this.identityCryptoService.decryptPlatformId({
            platformIdCiphertext: identity.platformIdCiphertext,
            platformIdIv: identity.platformIdIv,
            platformIdTag: identity.platformIdTag,
            platformIdWrappedKey: identity.platformIdWrappedKey,
            platformIdKeyId: identity.platformIdKeyId,
          });
        } catch {
          platformId = '[Decryption failed]';
        }
      }

      decrypted.push({
        id: identity.id,
        type: identity.type,
        identifier,
        platformId,
        isVerified: identity.isVerified,
        verifiedAt: identity.verifiedAt,
        createdAt: identity.createdAt,
      });
    }

    return decrypted;
  }
}

import { Writable } from 'stream';

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

/**
 * Service encapsulating Google Cloud Storage operations.
 *
 * Provides resilient streaming, buffer uploads, V4 signed download URL generation,
 * and lifecycle object management for Cloud Run environments.
 */
@Injectable()
export class GcpStorageService extends BaseService {
  private readonly storage: Storage;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    this.storage = new Storage({ projectId });
  }

  /**
   * Opens a writable stream to directly stream file chunks to a Cloud Storage object.
   * Keeps memory overhead bounded at O(1) buffer chunk size for large archive uploads.
   *
   * @param bucketName - The target GCS bucket name.
   * @param destinationPath - The object key / path within the bucket.
   * @param contentType - MIME type of the file (e.g. 'application/zip').
   * @param metadata - Optional custom metadata key-value pairs.
   * @returns Writable stream pipe target.
   */
  createWriteStream(
    bucketName: string,
    destinationPath: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Writable {
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    return file.createWriteStream({
      resumable: false,
      contentType,
      metadata: metadata ? { metadata } : undefined,
    });
  }

  /**
   * Uploads an in-memory buffer directly to a Cloud Storage object.
   *
   * @param bucketName - The target GCS bucket name.
   * @param destinationPath - The object key / path within the bucket.
   * @param buffer - The file content buffer.
   * @param contentType - MIME type of the file.
   * @param metadata - Optional custom metadata.
   */
  async uploadBuffer(
    bucketName: string,
    destinationPath: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const ctx = { bucketName, destinationPath, sizeBytes: buffer.length };
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(destinationPath);

      await file.save(buffer, {
        resumable: false,
        contentType,
        metadata: metadata ? { metadata } : undefined,
      });

      this.logger.debug('Uploaded buffer to Cloud Storage', {
        ...ctx,
        step: 'upload_buffer',
      });
    } catch (err: unknown) {
      this.logger.error('Failed to upload buffer to Cloud Storage', {
        ...ctx,
        step: 'upload_buffer',
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to store export archive in cloud storage',
      );
    }
  }

  /**
   * Generates a secure, time-limited V4 Signed URL for reading a Cloud Storage object.
   *
   * Relies on the GCP IAM Credentials API in Cloud Run environments via the service
   * account's roles/iam.serviceAccountTokenCreator role.
   *
   * @param bucketName - The target GCS bucket name.
   * @param filePath - The object key within the bucket.
   * @param expiresInMinutes - Duration in minutes for which the URL remains valid.
   * @returns The signed HTTPS URL string.
   */
  async getSignedDownloadUrl(
    bucketName: string,
    filePath: string,
    expiresInMinutes: number = 60,
  ): Promise<string> {
    const ctx = { bucketName, filePath, expiresInMinutes };
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filePath);

      const expires = Date.now() + expiresInMinutes * 60 * 1000;

      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires,
      });

      this.logger.debug('Generated V4 signed URL for Cloud Storage object', {
        ...ctx,
        step: 'get_signed_url',
      });

      return signedUrl;
    } catch (err: unknown) {
      this.logger.error('Failed to generate V4 signed URL', {
        ...ctx,
        step: 'get_signed_url',
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to generate download URL for export archive',
      );
    }
  }

  /**
   * Checks whether an object exists in Cloud Storage.
   *
   * @param bucketName - The target GCS bucket name.
   * @param filePath - The object key within the bucket.
   * @returns True if the object exists.
   */
  async fileExists(bucketName: string, filePath: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch (err: unknown) {
      this.logger.warn('Failed to check file existence in Cloud Storage', {
        bucketName,
        filePath,
        step: 'file_exists',
        err: serializeError(err),
      });
      return false;
    }
  }

  /**
   * Deletes a file from Cloud Storage.
   *
   * @param bucketName - The target GCS bucket name.
   * @param filePath - The object key within the bucket.
   */
  async deleteFile(bucketName: string, filePath: string): Promise<void> {
    const ctx = { bucketName, filePath };
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filePath);
      await file.delete({ ignoreNotFound: true });

      this.logger.debug('Deleted file from Cloud Storage', {
        ...ctx,
        step: 'delete_file',
      });
    } catch (err: unknown) {
      this.logger.error('Failed to delete file from Cloud Storage', {
        ...ctx,
        step: 'delete_file',
        err: serializeError(err),
      });
    }
  }
}

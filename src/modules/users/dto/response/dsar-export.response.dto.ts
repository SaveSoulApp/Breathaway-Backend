import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DsarExportStatus } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Response DTO representing the state and metadata of a DSAR data export.
 */
export class DsarExportResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the DSAR export request',
    example: '01JB0Z9G4K3V8W2N7Q1M9P6R5T',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Unique user identifier',
    example: '01JB0Z9G4K3V8W2N7Q1M9P6R5U',
  })
  @Expose()
  userId: string;

  @ApiProperty({
    enum: DsarExportStatus,
    description: 'Current lifecycle status of the export pipeline',
    example: DsarExportStatus.PENDING,
  })
  @Expose()
  status: DsarExportStatus;

  @ApiPropertyOptional({
    description:
      'Passphrase required to decrypt the AES-256 ZIP archive (returned only upon initial request creation)',
    example: 'A9xK2mP8qR4tW7yZ',
  })
  @Expose()
  passphrase?: string | null;

  @ApiPropertyOptional({
    description:
      'Time-limited V4 signed Google Cloud Storage download URL (available on GET when status is COMPLETED)',
    example: 'https://storage.googleapis.com/...',
  })
  @Expose()
  downloadUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Size of the completed export archive in bytes',
    example: 4194304,
  })
  @Expose()
  fileSizeBytes?: number | null;

  @ApiPropertyOptional({
    description: 'SHA-256 integrity checksum of the exported ZIP archive',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @Expose()
  checksumSha256?: string | null;

  @ApiProperty({
    description: 'Timestamp when the export request was received',
    example: '2026-10-18T12:00:00.000Z',
  })
  @Expose()
  requestedAt: Date;

  @ApiPropertyOptional({
    description: 'Timestamp when the background export processing completed',
    example: '2026-10-18T12:00:08.000Z',
  })
  @Expose()
  completedAt?: Date | null;

  @ApiPropertyOptional({
    description:
      'Canonical expiration timestamp when the archive file will be permanently purged (7 days from creation)',
    example: '2026-10-25T12:00:08.000Z',
  })
  @Expose()
  expiresAt?: Date | null;
}

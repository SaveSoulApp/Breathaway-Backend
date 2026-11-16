import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DevicePlatform,
  LegalConsentContext,
  LegalDocumentType,
} from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Immutable audit response representing a specific user acceptance event for a legal document.
 */
export class UserLegalConsentResponseDto {
  /** Unique ULID of the consent record. */
  @ApiProperty({
    description: 'Unique ULID of the consent record',
    example: '01JHABCDEF1234567890XYZ999',
  })
  @Expose()
  id: string;

  /** ULID of the accepted document version record. */
  @ApiProperty({
    description: 'Unique ULID of the associated LegalDocumentVersion',
    example: '01JHABCDEF1234567890XYZ123',
  })
  @Expose()
  documentVersionId: string;

  /** Type of the legal document. */
  @ApiProperty({
    enum: LegalDocumentType,
    description: 'Type of legal document accepted',
    example: LegalDocumentType.TERMS_OF_SERVICE,
  })
  @Expose()
  documentType: LegalDocumentType;

  /** Version accepted. */
  @ApiProperty({
    description: 'Version string of the accepted document',
    example: '1.0.0',
  })
  @Expose()
  version: string;

  /** Flow context during which consent was captured. */
  @ApiProperty({
    enum: LegalConsentContext,
    description: 'Interaction context when consent was captured',
    example: LegalConsentContext.SIGNUP,
  })
  @Expose()
  context: LegalConsentContext;

  /** Device platform. */
  @ApiProperty({
    enum: DevicePlatform,
    description: 'Device platform used when accepting',
    example: DevicePlatform.WEB,
  })
  @Expose()
  platform: DevicePlatform;

  /** Server-recorded IP address (sanitized for client display). */
  @ApiPropertyOptional({
    description: 'Client IP address recorded at acceptance',
    example: '203.0.113.1',
  })
  @Expose()
  ipAddress?: string;

  /** Server-recorded User Agent string. */
  @ApiPropertyOptional({
    description: 'Client user agent recorded at acceptance',
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
  })
  @Expose()
  userAgent?: string;

  /** Server UTC timestamp of explicit user acceptance. */
  @ApiProperty({
    description: 'Server UTC timestamp of acceptance',
  })
  @Expose()
  acceptedAt: Date;
}

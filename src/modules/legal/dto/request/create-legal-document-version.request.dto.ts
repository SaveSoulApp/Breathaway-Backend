import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';

/**
 * Administrative payload for publishing a new version of a legal document.
 */
export class CreateLegalDocumentVersionRequestDto {
  /**
   * The legal document type being published.
   */
  @ApiProperty({
    enum: LegalDocumentType,
    description: 'Type of legal document being published',
    example: LegalDocumentType.TERMS_OF_SERVICE,
  })
  @IsEnum(LegalDocumentType)
  type: LegalDocumentType;

  /**
   * Semantic or date-based version identifier.
   */
  @ApiProperty({
    description: 'Version identifier (e.g. 1.0.0 or 2026-11-16)',
    example: '1.0.0',
  })
  @IsString()
  @IsNotEmpty()
  version: string;

  /**
   * Human-readable title of the legal document.
   */
  @ApiProperty({
    description: 'Display title of the legal document',
    example: 'Terms and Conditions',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Canonical URL where the static document is hosted on the frontend website.
   */
  @ApiProperty({
    description: 'Canonical static website URL where the document is hosted',
    example: 'https://breathaway.app/terms',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  documentUrl: string;

  /**
   * Cryptographic SHA-256 digest of the canonical document content for immutable audit proof.
   */
  @ApiProperty({
    description:
      'SHA-256 hexadecimal checksum of the document content for audit verification (exact 64-character hex)',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message:
      'contentHash must be a valid 64-character SHA-256 hexadecimal digest',
  })
  contentHash: string;

  /**
   * Optional Cloud Storage URI archiving the immutable document snapshot.
   */
  @ApiPropertyOptional({
    description:
      'Optional Cloud Storage URI where the immutable version snapshot is archived',
    example: 'gs://breathaway-legal-archive/terms/v1.0.0.pdf',
  })
  @IsOptional()
  @IsString()
  snapshotStoragePath?: string;

  /**
   * Indicates whether this revision requires explicit re-acceptance from active users.
   */
  @ApiPropertyOptional({
    description:
      'Whether this revision materially alters terms and requires active user re-acceptance',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requiresReacceptance?: boolean;

  /**
   * Summary of material updates presented to users in notification notices and modal prompts.
   */
  @ApiPropertyOptional({
    description:
      'Summary of material changes to be presented to users in notification notices and modals',
    example:
      'Updated section 4 regarding cancellation policies and dispute resolution.',
  })
  @IsOptional()
  @IsString()
  changeSummary?: string;

  /**
   * Date and time when this legal version takes legal effect.
   */
  @ApiPropertyOptional({
    description:
      'ISO 8601 timestamp when this document version takes legal effect. Defaults to now if omitted.',
  })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

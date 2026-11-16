import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import { Expose } from 'class-transformer';

/**
 * Public response representing an active or published version of a legal document.
 */
export class LegalDocumentVersionResponseDto {
  /** Unique ULID of the legal document version record. */
  @ApiProperty({
    description: 'Unique ULID of the document version',
    example: '01JHABCDEF1234567890XYZ123',
  })
  @Expose()
  id: string;

  /** The type of legal document. */
  @ApiProperty({
    enum: LegalDocumentType,
    description: 'Type of legal document',
    example: LegalDocumentType.TERMS_OF_SERVICE,
  })
  @Expose()
  type: LegalDocumentType;

  /** Semantic or date version identifier. */
  @ApiProperty({
    description: 'Document version identifier',
    example: '1.0.0',
  })
  @Expose()
  version: string;

  /** Display title. */
  @ApiProperty({
    description: 'Document display title',
    example: 'Terms and Conditions',
  })
  @Expose()
  title: string;

  /** Canonical static URL. */
  @ApiProperty({
    description: 'Canonical URL where the static document is hosted',
    example: 'https://breathaway.app/terms',
  })
  @Expose()
  documentUrl: string;

  /** SHA-256 content digest for tamper verification. */
  @ApiProperty({
    description: 'Cryptographic SHA-256 hash of the canonical content',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @Expose()
  contentHash: string;

  /** Whether material updates require active re-acceptance. */
  @ApiProperty({
    description: 'Whether active users are required to re-accept this version',
    example: false,
  })
  @Expose()
  requiresReacceptance: boolean;

  /** Summary of material changes if applicable. */
  @ApiPropertyOptional({
    description: 'Summary of material revisions',
    example: 'Updated cancellation clause.',
  })
  @Expose()
  changeSummary?: string;

  /** Date when the version takes legal effect. */
  @ApiProperty({
    description: 'Timestamp when this version takes legal effect',
  })
  @Expose()
  effectiveAt: Date;

  /** Date when the version was published. */
  @ApiProperty({
    description: 'Timestamp when this version was published',
  })
  @Expose()
  publishedAt: Date;
}

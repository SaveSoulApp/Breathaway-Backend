import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { LegalDocumentVersionResponseDto } from './legal-document-version.response.dto';

/**
 * Compliance status payload detailing whether the authenticated user has pending or upcoming policy updates.
 */
export class LegalComplianceStatusResponseDto {
  /**
   * Whether the user is fully compliant with all currently enforced legal terms.
   */
  @ApiProperty({
    description:
      'True if the user has accepted all currently enforced legal documents',
    example: true,
  })
  @Expose()
  isCompliant: boolean;

  /**
   * List of legal documents that have taken effect and require immediate user acceptance.
   */
  @ApiProperty({
    type: [LegalDocumentVersionResponseDto],
    description:
      'Documents requiring immediate user re-acceptance before continued app use',
  })
  @Expose()
  @Type(() => LegalDocumentVersionResponseDto)
  pendingDocuments: LegalDocumentVersionResponseDto[];

  /**
   * List of upcoming revisions published with advance notice that have not yet reached their effective date.
   */
  @ApiProperty({
    type: [LegalDocumentVersionResponseDto],
    description:
      'Upcoming document revisions published with advance notice for informational banners',
  })
  @Expose()
  @Type(() => LegalDocumentVersionResponseDto)
  upcomingDocuments: LegalDocumentVersionResponseDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';

import { AcceptedLegalDocumentRequestDto } from './accepted-legal-document.request.dto';

/**
 * Payload for explicitly acknowledging and accepting updated legal documents.
 */
export class AcceptLegalConsentRequestDto {
  /**
   * List of legal documents and versions being accepted by the user.
   */
  @ApiProperty({
    type: [AcceptedLegalDocumentRequestDto],
    description: 'List of legal documents and versions accepted by the user',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AcceptedLegalDocumentRequestDto)
  consents: AcceptedLegalDocumentRequestDto[];
}

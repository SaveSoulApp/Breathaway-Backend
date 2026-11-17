import { ApiProperty } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload representing an individual legal document accepted by a user.
 */
export class AcceptedLegalDocumentRequestDto {
  /**
   * The legal document type being consented to.
   */
  @ApiProperty({
    enum: LegalDocumentType,
    description: 'The type of legal document being accepted',
    example: LegalDocumentType.TERMS_OF_SERVICE,
  })
  @IsEnum(LegalDocumentType)
  documentType: LegalDocumentType;

  /**
   * Semantic or date-based version identifier of the accepted document.
   */
  @ApiProperty({
    description:
      'The semantic or date version string of the document being accepted',
    example: '1.0.0',
  })
  @IsString()
  @IsNotEmpty()
  version: string;
}

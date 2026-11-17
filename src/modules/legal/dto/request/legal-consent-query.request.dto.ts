import { ApiPropertyOptional } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters for retrieving paginated user legal consent history.
 */
export class LegalConsentQueryRequestDto {
  /**
   * 1-based page index.
   */
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Number of items per page.
   */
  @ApiPropertyOptional({
    description: 'Number of records per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Optional filter by document type.
   */
  @ApiPropertyOptional({
    enum: LegalDocumentType,
    description: 'Filter consents by document type',
  })
  @IsOptional()
  @IsEnum(LegalDocumentType)
  documentType?: LegalDocumentType;
}

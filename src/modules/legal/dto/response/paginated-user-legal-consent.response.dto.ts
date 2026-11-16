import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PaginationMeta } from '@common/dto';

import { UserLegalConsentResponseDto } from './user-legal-consent.response.dto';

/**
 * Paginated envelope for user legal consent audit history.
 */
export class PaginatedUserLegalConsentResponseDto {
  /** Array of consent records for the requested page. */
  @ApiProperty({ type: [UserLegalConsentResponseDto] })
  @Expose()
  @Type(() => UserLegalConsentResponseDto)
  data: UserLegalConsentResponseDto[];

  /** Standard pagination metadata. */
  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}

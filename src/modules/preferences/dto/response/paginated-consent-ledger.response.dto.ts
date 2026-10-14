import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PaginationMeta } from '@common/dto';

import { ConsentLedgerResponseDto } from './consent-ledger.response.dto';

/**
 * Paginated response envelope for `GET /preferences/consents`; wraps the consent
 * ledger entry array with standard pagination metadata (page, limit, total, hasNext, hasPrev).
 */
export class PaginatedConsentLedgerResponseDto {
  /** Array of consent ledger entries for the requested page. */
  @ApiProperty({ type: [ConsentLedgerResponseDto] })
  @Expose()
  @Type(() => ConsentLedgerResponseDto)
  data: ConsentLedgerResponseDto[];

  /** Standard pagination metadata providing client navigation state. */
  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}

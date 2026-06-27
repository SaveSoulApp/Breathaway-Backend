import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CreditLedgerResponseDto } from './credit-ledger.response.dto';
import { PaginationMeta } from '@common/dto';

/**
 * Paginated response for `GET /credits/ledger`; wraps the ledger entry array with
 * standard pagination metadata (page, limit, total, hasNext, hasPrev).
 */
export class PaginatedCreditLedgerResponseDto {
  @ApiProperty({ type: [CreditLedgerResponseDto] })
  @Expose()
  @Type(() => CreditLedgerResponseDto)
  data: CreditLedgerResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}

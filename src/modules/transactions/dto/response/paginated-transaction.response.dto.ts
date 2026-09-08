import { PaginationMeta } from '@common/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { TransactionResponseDto } from './transaction.response.dto';

/**
 * Paginated response for `GET /admin/transactions`; wraps the transaction array
 * with standard pagination metadata.
 */
export class PaginatedTransactionResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  @Expose()
  @Type(() => TransactionResponseDto)
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}

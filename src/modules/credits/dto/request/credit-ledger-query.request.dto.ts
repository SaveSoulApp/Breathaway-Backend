import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SortOrder } from '@common/enums';
import { CreditLedgerSortBy, CreditStatusFilter } from '../../enums';
import { CreditSource, CreditTransactionType } from '@prisma/client';

/**
 * Query parameters for `GET /credits/ledger`; all fields are optional and combine
 * as AND filters on the ledger query.
 */
export class CreditLedgerQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: CreditLedgerSortBy,
    default: CreditLedgerSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(CreditLedgerSortBy)
  sortBy?: CreditLedgerSortBy = CreditLedgerSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    enum: CreditTransactionType,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(CreditTransactionType)
  transactionType?: CreditTransactionType;

  @ApiPropertyOptional({
    description: 'Filter by credit status',
    enum: CreditStatusFilter,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(CreditStatusFilter)
  creditStatus?: CreditStatusFilter;

  /** Accepts a single value or an array; transformed to uppercase before validation. Multiple sources are OR-combined in the query. */
  @ApiPropertyOptional({
    description:
      'Filter by credit source. Allows multiple values as an array or a single string.',
    enum: CreditSource,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v: unknown) =>
      typeof v === 'string' ? v.toUpperCase() : v,
    );
  })
  @IsEnum(CreditSource, { each: true })
  source?: CreditSource[];

  @ApiPropertyOptional({
    description: 'Filter by creation date from (UTC ISO8601 format)',
  })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  /** When a date-only string is provided (no time component), the service automatically expands it to end-of-day UTC to make the filter day-inclusive. */
  @ApiPropertyOptional({
    description: 'Filter by creation date to (UTC ISO8601 format)',
  })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  /** Mutually exclusive with `creditStatus=EXPIRED` — this filter always excludes already-expired entries. */
  @ApiPropertyOptional({
    description:
      'Filter by credits expiring within X days (only includes non-expired)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  expiresWithinDays?: number;

  /** Case-insensitive partial match against `referenceId`. */
  @ApiPropertyOptional({
    description: 'Partial match search by referenceId',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

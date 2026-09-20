import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
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

import { TransactionSortBy } from '../../enums';

/**
 * Query parameters for `GET /admin/transactions`; all fields are optional and
 * combine as AND filters.
 */
export class TransactionQueryRequestDto {
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
    enum: TransactionSortBy,
    default: TransactionSortBy.OCCURRED_AT,
  })
  @IsOptional()
  @IsEnum(TransactionSortBy)
  sortBy?: TransactionSortBy = TransactionSortBy.OCCURRED_AT;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: 'Filter by user ULID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    enum: PaymentGateway,
    description: 'Filter by gateway',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(PaymentGateway)
  gateway?: PaymentGateway;

  @ApiPropertyOptional({ enum: TransactionType, description: 'Filter by type' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    description: 'Filter by status',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  /** Useful for separating Test Store noise from live purchases while experimenting. */
  @ApiPropertyOptional({
    enum: TransactionEnvironment,
    description: 'Filter by environment',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(TransactionEnvironment)
  environment?: TransactionEnvironment;

  @ApiPropertyOptional({
    enum: TransactionChannel,
    description: 'Filter by channel (IOS, ANDROID, WEB)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(TransactionChannel)
  channel?: TransactionChannel;

  @ApiPropertyOptional({ description: 'Filter by store product identifier' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filter by occurrence date from (UTC ISO8601)',
  })
  @IsOptional()
  @IsISO8601()
  occurredFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter by occurrence date to (UTC ISO8601)',
  })
  @IsOptional()
  @IsISO8601()
  occurredTo?: string;

  /** Case-insensitive partial match against `gatewayTransactionId`. */
  @ApiPropertyOptional({
    description: 'Partial match search by gateway transaction ID',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

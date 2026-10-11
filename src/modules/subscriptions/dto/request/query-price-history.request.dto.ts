import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class QueryPriceHistoryRequestDto {
  @ApiPropertyOptional({
    description: 'Filter by ISO 3166-1 alpha-2 country code',
    example: 'IN',
    minLength: 2,
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  countryCode?: string;

  @ApiPropertyOptional({
    description:
      'Query pricing history configurations active on or after this ISO 8601 date',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Query pricing history configurations active on or before this ISO 8601 date',
    example: '2026-04-30T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Exact point-in-time ISO 8601 timestamp to reconstruct the active price at that moment',
    example: '2026-02-12T15:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  pointInTime?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of history records per page',
    default: 100,
    minimum: 1,
    maximum: 200,
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Chronological sort order by effectiveFrom',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

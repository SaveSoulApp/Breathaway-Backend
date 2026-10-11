import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

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
}

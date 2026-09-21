import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Query parameters for GET /subscriptions/plans.
 *
 * Allows optionally filtering subscription plan prices by ISO 3166-1 alpha-2 country code.
 * If omitted, the region is determined by the authenticated user profile or the server default.
 */
export class ListPlansQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter prices by ISO 3166-1 alpha-2 country code (e.g. "IN", "US")',
    example: 'IN',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value?: string }) => value?.trim().toUpperCase())
  countryCode?: string;
}

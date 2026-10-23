import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Tentative geographic location resolved from the client IP address.
 */
export class SessionLocationDto {
  @ApiPropertyOptional({
    description: 'Resolved city name',
    example: 'Mumbai',
    nullable: true,
  })
  @Expose()
  city?: string | null;

  @ApiPropertyOptional({
    description: 'Resolved state or region',
    example: 'Maharashtra',
    nullable: true,
  })
  @Expose()
  region?: string | null;

  @ApiPropertyOptional({
    description: 'Two-letter ISO 3166-1 alpha-2 country code',
    example: 'IN',
    nullable: true,
  })
  @Expose()
  countryCode?: string | null;

  @ApiPropertyOptional({
    description: 'Full human-readable country name',
    example: 'India',
    nullable: true,
  })
  @Expose()
  countryName?: string | null;

  @ApiPropertyOptional({
    description: 'IANA time zone identifier',
    example: 'Asia/Kolkata',
    nullable: true,
  })
  @Expose()
  timezone?: string | null;

  @ApiPropertyOptional({
    description: 'User-friendly formatted location summary for client displays',
    example: 'Mumbai, India',
    nullable: true,
  })
  @Expose()
  formatted?: string | null;
}

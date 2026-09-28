import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Request body for updating an existing payment gateway route.
 */
export class UpdatePaymentRouteRequestDto {
  @ApiPropertyOptional({
    description:
      'Ordinal priority step number (1 = primary). Must be a valid step within 1..N for the route country. ' +
      'When changed, adjacent routes are atomically re-ranked.',
    example: 2,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Whether this route is enabled for checkout routing.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Minimum transaction amount in smallest currency unit (e.g. paise for INR). Set null to remove limit.',
    example: 100,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAmount?: number | null;

  @ApiPropertyOptional({
    description:
      'Maximum transaction amount in smallest currency unit (e.g. paise for INR). Set null to remove limit.',
    example: 500000,
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAmount?: number | null;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdatePlanPriceRequestDto {
  @ApiPropertyOptional({
    description: 'Updated regular base/anchor price (up to 2 decimal places)',
    example: 499.0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  originalPrice?: number;

  @ApiPropertyOptional({
    description:
      'Promotional discounted price (pass null to clear active promotion)',
    example: 399.0,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  discountedPrice?: number | null;

  @ApiPropertyOptional({
    description:
      'Promotional discount start timestamp (ISO 8601 UTC, pass null to clear)',
    example: '2026-11-01T00:00:00Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsDateString()
  discountStartsAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Promotional discount end timestamp (ISO 8601 UTC, pass null to clear)',
    example: '2026-11-07T23:59:59Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsDateString()
  discountEndsAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Audit justification reason for updating this price or promotional window',
    example: 'Annual base price increase from 399 to 499 approved by Finance',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

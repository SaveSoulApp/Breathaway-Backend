import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyCode } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class CreatePlanPriceRequestDto {
  @ApiProperty({
    enum: CurrencyCode,
    description: 'Currency code for the price',
  })
  @IsEnum(CurrencyCode)
  currencyCode: CurrencyCode;

  @ApiProperty({
    description: 'Regular base/anchor price (up to 2 decimal places)',
    example: 399.0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  originalPrice: number;

  @ApiPropertyOptional({
    description: 'Promotional discounted price (up to 2 decimal places)',
    example: 299.0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  discountedPrice?: number;

  @ApiPropertyOptional({
    description: 'Promotional discount start timestamp (ISO 8601 UTC)',
    example: '2026-10-15T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  discountStartsAt?: string;

  @ApiPropertyOptional({
    description: 'Promotional discount end timestamp (ISO 8601 UTC)',
    example: '2026-10-25T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  discountEndsAt?: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'IN',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  countryCode: string;

  @ApiPropertyOptional({
    description:
      'Audit justification reason for creating this price configuration',
    example: 'Initial pricing setup for Q4 2026',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

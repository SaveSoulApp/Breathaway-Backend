import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyCode } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class SubscriptionPlanPriceResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: CurrencyCode })
  @Expose()
  currencyCode: CurrencyCode;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code' })
  @Expose()
  countryCode: string;

  @ApiProperty({
    description:
      'Regular base/anchor price (crossed-out on UI if discount is active)',
    example: 399.0,
  })
  @Expose()
  @Type(() => Number)
  originalPrice: number;

  @ApiPropertyOptional({
    description: 'Promotional discounted price if configured',
    example: 299.0,
    nullable: true,
  })
  @Expose()
  @Type(() => Number)
  discountedPrice?: number | null;

  @ApiProperty({
    description: 'The exact amount the customer must pay right now',
    example: 299.0,
  })
  @Expose()
  @Type(() => Number)
  effectivePrice: number;

  @ApiPropertyOptional({
    description: 'Backwards-compatible alias for effectivePrice',
    example: 299.0,
  })
  @Expose()
  @Type(() => Number)
  price?: number;

  @ApiProperty({
    description: 'Whether a promotional discount is actively running right now',
    example: true,
  })
  @Expose()
  isDiscountActive: boolean;

  @ApiPropertyOptional({
    description: 'Calculated percentage discount (e.g. 25 for 25% off)',
    example: 25,
  })
  @Expose()
  @Type(() => Number)
  discountPercentage?: number;

  @ApiPropertyOptional({
    description:
      'Calculated absolute savings amount (e.g. 100 for INR 100 off)',
    example: 100.0,
  })
  @Expose()
  @Type(() => Number)
  savingsAmount?: number;

  @ApiPropertyOptional({
    description: 'Promotional discount start timestamp (UTC)',
    nullable: true,
  })
  @Expose()
  discountStartsAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Promotional discount end timestamp (UTC)',
    nullable: true,
  })
  @Expose()
  discountEndsAt?: Date | null;
}

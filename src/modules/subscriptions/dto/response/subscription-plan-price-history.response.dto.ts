import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyCode, SubscriptionPriceChangeType } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class SubscriptionPlanPriceHistoryResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiPropertyOptional({
    description: 'ID of the pricing configuration (null if deleted)',
    nullable: true,
  })
  @Expose()
  priceId?: string | null;

  @ApiProperty()
  @Expose()
  planId: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code' })
  @Expose()
  countryCode: string;

  @ApiProperty({ enum: CurrencyCode })
  @Expose()
  currencyCode: CurrencyCode;

  @ApiProperty({
    description: 'Regular base price during this effective interval',
    example: 399.0,
  })
  @Expose()
  @Type(() => Number)
  originalPrice: number;

  @ApiPropertyOptional({
    description:
      'Promotional discounted price during this interval if configured',
    example: 299.0,
    nullable: true,
  })
  @Expose()
  @Type(() => Number)
  discountedPrice?: number | null;

  @ApiPropertyOptional({
    description: 'Promotion start timestamp',
    nullable: true,
  })
  @Expose()
  discountStartsAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Promotion end timestamp',
    nullable: true,
  })
  @Expose()
  discountEndsAt?: Date | null;

  @ApiProperty({
    description: 'Timestamp when this pricing configuration became effective',
  })
  @Expose()
  effectiveFrom: Date;

  @ApiPropertyOptional({
    description:
      'Timestamp when this pricing configuration ended or was superseded (null if currently active)',
    nullable: true,
  })
  @Expose()
  effectiveTo?: Date | null;

  @ApiProperty({
    enum: SubscriptionPriceChangeType,
    description:
      'Type of change: INITIAL_PRICE, BASE_PRICE_INCREASE, BASE_PRICE_DECREASE, PROMO_SCHEDULED, PROMO_ENDED, PROMO_UPDATED, PRICE_UPDATED, PRICE_DELETED',
    example: 'BASE_PRICE_INCREASE',
  })
  @Expose()
  changeType: SubscriptionPriceChangeType;

  @ApiProperty({
    description: 'Actor user ID who made or authorized the change',
    example: 'user_01J8VXYZ',
  })
  @Expose()
  changedByUserId: string;

  @ApiPropertyOptional({
    description: 'Business rationale for the price modification',
    example: 'Annual base price increase from 399 to 499 approved by Finance',
    nullable: true,
  })
  @Expose()
  changeReason?: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

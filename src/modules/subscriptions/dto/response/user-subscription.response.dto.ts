import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CurrencyCode,
  StorePlatform,
  SubscriptionStatus,
} from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class SubscriptionPlanSummaryResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  slug: string;

  @ApiProperty()
  @Expose()
  creditsGranted: number;

  @ApiProperty()
  @Expose()
  validityDays: number;
}

export class UserSubscriptionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  planId: string;

  @ApiProperty({ enum: SubscriptionStatus })
  @Expose()
  status: SubscriptionStatus;

  @ApiProperty({ enum: StorePlatform })
  @Expose()
  storePlatform: StorePlatform;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  storeTransactionId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  storeProductId: string | null;

  @ApiProperty()
  @Expose()
  currentPeriodStart: Date;

  @ApiProperty()
  @Expose()
  currentPeriodEnd: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  @Expose()
  trialEnd: Date | null;

  @ApiProperty()
  @Expose()
  autoRenewing: boolean;

  @ApiPropertyOptional({ type: Date, nullable: true })
  @Expose()
  cancelledAt: Date | null;

  @ApiProperty()
  @Expose()
  expiresAt: Date;

  @ApiPropertyOptional({ enum: CurrencyCode, nullable: true })
  @Expose()
  currencyCode: CurrencyCode | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Expose()
  pricePaid: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  countryCode: string | null;

  @ApiProperty({ type: () => SubscriptionPlanSummaryResponseDto })
  @Expose()
  @Type(() => SubscriptionPlanSummaryResponseDto)
  plan: SubscriptionPlanSummaryResponseDto;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

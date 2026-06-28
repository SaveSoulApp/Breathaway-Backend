import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlanStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

import { SubscriptionPlanPriceResponseDto } from './subscription-plan-price.response.dto';

export class SubscriptionPlanResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  description: string | null;

  @ApiProperty()
  @Expose()
  slug: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  appleProductId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  googleProductId: string | null;

  @ApiProperty()
  @Expose()
  creditsGranted: number;

  @ApiProperty()
  @Expose()
  validityDays: number;

  @ApiProperty()
  @Expose()
  trialDurationDays: number;

  @ApiProperty()
  @Expose()
  sortOrder: number;

  @ApiProperty({ enum: SubscriptionPlanStatus })
  @Expose()
  status: SubscriptionPlanStatus;

  @ApiProperty({ type: [SubscriptionPlanPriceResponseDto] })
  @Expose()
  @Type(() => SubscriptionPlanPriceResponseDto)
  prices: SubscriptionPlanPriceResponseDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

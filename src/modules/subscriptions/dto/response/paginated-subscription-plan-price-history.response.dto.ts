import { PaginationMeta } from '@common/dto';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { SubscriptionPlanPriceHistoryResponseDto } from './subscription-plan-price-history.response.dto';

/**
 * Standard paginated response envelope for subscription plan price audit history.
 */
export class PaginatedSubscriptionPlanPriceHistoryResponseDto {
  @ApiProperty({ type: [SubscriptionPlanPriceHistoryResponseDto] })
  @Expose()
  @Type(() => SubscriptionPlanPriceHistoryResponseDto)
  data: SubscriptionPlanPriceHistoryResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  @Expose()
  @Type(() => PaginationMeta)
  meta: PaginationMeta;
}

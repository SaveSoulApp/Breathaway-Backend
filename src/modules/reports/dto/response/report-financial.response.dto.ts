import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { TotalCreditsGivenDto } from './report.response.dto';

export class CurrencyRevenueDto {
  @ApiProperty({ description: 'Currency code (e.g., INR, USD)' })
  currency: string;

  @ApiProperty({ description: 'Total revenue collected in this currency' })
  amount: number;

  @ApiProperty({ description: 'Number of completed transactions' })
  count: number;
}

export class ChannelRevenueDto {
  @ApiProperty({ description: 'Revenue originating from Apple iOS App Store' })
  ios: number;

  @ApiProperty({ description: 'Revenue originating from Google Play Store' })
  android: number;

  @ApiProperty({ description: 'Revenue originating from Web checkout' })
  web: number;
}

export class GatewayRevenueDto {
  @ApiProperty({ description: 'Revenue handled via RevenueCat' })
  revenuecat: number;

  @ApiProperty({ description: 'Revenue handled via Razorpay' })
  razorpay: number;

  @ApiProperty({ description: 'Revenue handled via Cashfree' })
  cashfree: number;

  @ApiProperty({ description: 'Revenue handled via Easebuzz' })
  easebuzz: number;

  @ApiProperty({ description: 'Revenue handled via Decentro' })
  decentro: number;
}

export class FinancialRevenueDto {
  @ApiProperty({
    description: 'Estimated gross total revenue normalized in primary currency',
  })
  totalGross: number;

  @ApiProperty({ type: [CurrencyRevenueDto] })
  @ValidateNested({ each: true })
  @Type(() => CurrencyRevenueDto)
  currencies: CurrencyRevenueDto[];

  @ApiProperty({ type: ChannelRevenueDto })
  @ValidateNested()
  @Type(() => ChannelRevenueDto)
  channelSplit: ChannelRevenueDto;

  @ApiProperty({ type: GatewayRevenueDto })
  @ValidateNested()
  @Type(() => GatewayRevenueDto)
  gatewaySplit: GatewayRevenueDto;
}

export class FinancialOrdersDto {
  @ApiProperty({ description: 'Total payment orders created' })
  totalOrders: number;

  @ApiProperty({ description: 'Orders successfully paid and captured' })
  paid: number;

  @ApiProperty({ description: 'Orders failed or declined' })
  failed: number;

  @ApiProperty({ description: 'Orders expired without checkout completion' })
  expired: number;

  @ApiProperty({ description: 'Orders refunded post-capture' })
  refunded: number;

  @ApiProperty({
    description: 'Payment success conversion percentage (paid / total) * 100',
  })
  successRatePercent: number;
}

export class StorePlatformSplitDto {
  @ApiProperty({ description: 'Apple App Store subscriptions' })
  apple: number;

  @ApiProperty({ description: 'Google Play Store subscriptions' })
  google: number;
}

export class SubscriptionPlanStatDto {
  @ApiProperty({ description: 'Subscription plan identifier' })
  planId: string;

  @ApiProperty({ description: 'Plan unique slug' })
  slug: string;

  @ApiProperty({ description: 'Plan display name' })
  name: string;

  @ApiProperty({ description: 'Active subscriber count for this plan' })
  activeSubscribers: number;
}

export class FinancialSubscriptionsDto {
  @ApiProperty({ description: 'Total currently active subscriptions' })
  totalActive: number;

  @ApiProperty({ description: 'Subscriptions currently in free trial' })
  trial: number;

  @ApiProperty({
    description: 'Subscriptions currently in billing grace period',
  })
  gracePeriod: number;

  @ApiProperty({ description: 'Subscriptions cancelled by user' })
  cancelled: number;

  @ApiProperty({ description: 'Subscriptions fully expired' })
  expired: number;

  @ApiProperty({ type: StorePlatformSplitDto })
  @ValidateNested()
  @Type(() => StorePlatformSplitDto)
  platformSplit: StorePlatformSplitDto;

  @ApiProperty({ type: [SubscriptionPlanStatDto] })
  @ValidateNested({ each: true })
  @Type(() => SubscriptionPlanStatDto)
  planSplit: SubscriptionPlanStatDto[];
}

export class FinancialCreditsDto {
  @ApiProperty({ type: TotalCreditsGivenDto })
  @ValidateNested()
  @Type(() => TotalCreditsGivenDto)
  given: TotalCreditsGivenDto;

  @ApiProperty({ description: 'Total credits utilised or debited' })
  utilisedTotal: number;

  @ApiProperty({ description: 'Net circulating credits (given - utilised)' })
  circulatingBalance: number;
}

export class ReportFinancialResponseDto {
  @ApiProperty({ type: FinancialRevenueDto })
  @ValidateNested()
  @Type(() => FinancialRevenueDto)
  revenue: FinancialRevenueDto;

  @ApiProperty({ type: FinancialOrdersDto })
  @ValidateNested()
  @Type(() => FinancialOrdersDto)
  orders: FinancialOrdersDto;

  @ApiProperty({ type: FinancialSubscriptionsDto })
  @ValidateNested()
  @Type(() => FinancialSubscriptionsDto)
  subscriptions: FinancialSubscriptionsDto;

  @ApiProperty({ type: FinancialCreditsDto })
  @ValidateNested()
  @Type(() => FinancialCreditsDto)
  credits: FinancialCreditsDto;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class SummaryUsersBannerDto {
  @ApiProperty({ description: 'Total active (non-deleted) registered users' })
  total: number;

  @ApiProperty({
    description: 'Active users with sessions in the past 30 days',
  })
  active30d: number;

  @ApiProperty({ description: 'Total users with completed profiles' })
  completedProfiles: number;

  @ApiProperty({ description: 'Percentage of users with completed profiles' })
  completionRatePercent: number;
}

export class SummaryFinancialBannerDto {
  @ApiProperty({
    description:
      'Total gross revenue across all currencies converted or reported',
  })
  totalGrossRevenue: number;

  @ApiProperty({ description: 'Total gross revenue in the selected timeframe' })
  periodRevenue: number;

  @ApiProperty({
    description: 'Current count of active paid user subscriptions',
  })
  activeSubscriptionsCount: number;

  @ApiProperty({ description: 'Total successful payment orders' })
  successfulOrdersCount: number;
}

export class SummaryEngagementBannerDto {
  @ApiProperty({ description: 'Total likes sent across the platform' })
  totalLikesSent: number;

  @ApiProperty({ description: 'Total active pending likes awaiting response' })
  pendingLikes: number;

  @ApiProperty({ description: 'Total matches established' })
  totalMatches: number;

  @ApiProperty({
    description: 'Match conversion rate as (2 * matches / likes) * 100',
  })
  matchConversionRatePercent: number;
}

export class SummaryViralBannerDto {
  @ApiProperty({ description: 'Total identities claimed by registered users' })
  claimedIdentities: number;

  @ApiProperty({
    description: 'Total unclaimed identities awaiting user registration',
  })
  unclaimedIdentities: number;

  @ApiProperty({
    description:
      'Total pending likes awaiting registration of unclaimed contacts',
  })
  viralPendingLikesCount: number;

  @ApiProperty({ description: 'Claim rate percentage of total identities' })
  viralClaimRatePercent: number;
}

export class SummaryChatBannerDto {
  @ApiProperty({ description: 'Total chat messages exchanged' })
  totalMessages: number;

  @ApiProperty({
    description: 'Total active chat rooms containing at least one message',
  })
  activeRoomsCount: number;

  @ApiProperty({
    description: 'Percentage of sent messages that have been read',
  })
  readRatePercent: number;
}

export class ReportSummaryResponseDto {
  @ApiProperty({ type: SummaryUsersBannerDto })
  @ValidateNested()
  @Type(() => SummaryUsersBannerDto)
  users: SummaryUsersBannerDto;

  @ApiProperty({ type: SummaryFinancialBannerDto })
  @ValidateNested()
  @Type(() => SummaryFinancialBannerDto)
  financial: SummaryFinancialBannerDto;

  @ApiProperty({ type: SummaryEngagementBannerDto })
  @ValidateNested()
  @Type(() => SummaryEngagementBannerDto)
  engagement: SummaryEngagementBannerDto;

  @ApiProperty({ type: SummaryViralBannerDto })
  @ValidateNested()
  @Type(() => SummaryViralBannerDto)
  viral: SummaryViralBannerDto;

  @ApiProperty({ type: SummaryChatBannerDto })
  @ValidateNested()
  @Type(() => SummaryChatBannerDto)
  chat: SummaryChatBannerDto;
}

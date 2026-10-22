import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

export class TimeframeDto {
  @ApiProperty({ nullable: true })
  startDate: Date | null;

  @ApiProperty({ nullable: true })
  endDate: Date | null;
}

export class DemographicsDto {
  @ApiProperty()
  male: number;

  @ApiProperty()
  female: number;

  @ApiProperty()
  nonbinary: number;

  @ApiProperty()
  other: number;

  @ApiProperty()
  unknown: number;
}

export class IdentitySplitDto {
  @ApiProperty()
  instagram: number;

  @ApiProperty()
  phone: number;

  @ApiProperty()
  email: number;

  @ApiProperty()
  linkedin: number;

  @ApiProperty()
  twitter: number;

  @ApiProperty()
  other: number;
}

export class PlatformSplitDto {
  @ApiProperty()
  android: number;

  @ApiProperty()
  ios: number;

  @ApiProperty()
  web: number;
}

export class IntentStatsDto {
  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

export class IntentSplitDto {
  @ApiProperty({ type: IntentStatsDto })
  @ValidateNested()
  @Type(() => IntentStatsDto)
  relationship: IntentStatsDto;

  @ApiProperty({ type: IntentStatsDto })
  @ValidateNested()
  @Type(() => IntentStatsDto)
  casual: IntentStatsDto;

  @ApiProperty({ type: IntentStatsDto })
  @ValidateNested()
  @Type(() => IntentStatsDto)
  open: IntentStatsDto;
}

export class LikeStatusSummaryDto {
  @ApiProperty({ description: 'Active likes awaiting a match' })
  pending: number;

  @ApiProperty({ description: 'Likes successfully matched' })
  matched: number;

  @ApiProperty({ description: 'Likes voided or expired' })
  voided: number;

  @ApiProperty({ description: 'Likes withdrawn by sender' })
  withdrawn: number;

  @ApiProperty({ description: 'Soft-deleted likes' })
  deleted: number;
}

export class MatchStatusSummaryDto {
  @ApiProperty({ description: 'Active matches' })
  active: number;

  @ApiProperty({ description: 'Unmatched pairings' })
  unmatched: number;

  @ApiProperty({ description: 'Matches severed due to blocks' })
  blocked: number;
}

export class CreditsGivenSplitDto {
  @ApiProperty()
  purchase: number;

  @ApiProperty()
  bonus: number;

  @ApiProperty()
  referral: number;

  @ApiProperty()
  admin: number;

  @ApiProperty()
  likeUsage: number;

  @ApiProperty()
  expired: number;

  @ApiProperty()
  subscription: number;
}

export class TotalFinancialSummaryDto {
  @ApiProperty({ description: 'Total gross revenue collected' })
  totalGrossRevenue: number;

  @ApiProperty({ description: 'Current active paid subscriptions count' })
  activeSubscriptions: number;

  @ApiProperty({ description: 'Total successful payment orders' })
  successfulOrders: number;
}

export class TotalChatSummaryDto {
  @ApiProperty({ description: 'Total chat rooms' })
  totalRooms: number;

  @ApiProperty({ description: 'Active chat rooms with at least 1 message' })
  activeRooms: number;

  @ApiProperty({ description: 'Total messages exchanged' })
  totalMessages: number;

  @ApiProperty({ description: 'Percentage of messages that have been read' })
  readRatePercent: number;
}

// TOTAL REPORT DTOs
export class TotalUsersReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  completedProfiles: number;

  @ApiProperty({ type: DemographicsDto })
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics: DemographicsDto;
}

export class TotalIdentitiesReportDto {
  @ApiProperty()
  total: number;

  @ApiPropertyOptional({
    description: 'Identities claimed by registered users',
  })
  @IsOptional()
  claimed?: number;

  @ApiPropertyOptional({ description: 'Unclaimed identities in viral pool' })
  @IsOptional()
  unclaimed?: number;

  @ApiPropertyOptional({ description: 'Verified identities count' })
  @IsOptional()
  verified?: number;

  @ApiProperty()
  averagePerUser: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  split: IdentitySplitDto;
}

export class TotalDevicesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  averagePerUser: number;

  @ApiProperty({ type: PlatformSplitDto })
  @ValidateNested()
  @Type(() => PlatformSplitDto)
  platformSplit: PlatformSplitDto;
}

export class TotalLikesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  averagePerUser: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  targetIdentitySplit: IdentitySplitDto;

  @ApiProperty({ type: IntentSplitDto })
  @ValidateNested()
  @Type(() => IntentSplitDto)
  intentSplit: IntentSplitDto;

  @ApiPropertyOptional({ type: LikeStatusSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LikeStatusSummaryDto)
  statusSplit?: LikeStatusSummaryDto;
}

export class TotalMatchesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  averagePerUser: number;

  @ApiPropertyOptional({
    description: 'Match conversion rate as (2 * matches / likes) * 100',
  })
  @IsOptional()
  conversionRatePercent?: number;

  @ApiPropertyOptional({ type: MatchStatusSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchStatusSummaryDto)
  statusSplit?: MatchStatusSummaryDto;
}

export class BlocksReportDto {
  @ApiProperty()
  total: number;
}

export class TotalCreditsGivenDto {
  @ApiProperty()
  total: number;

  @ApiProperty({ type: CreditsGivenSplitDto })
  @ValidateNested()
  @Type(() => CreditsGivenSplitDto)
  splitBySource: CreditsGivenSplitDto;
}

export class TotalCreditsReportDto {
  @ApiProperty({ type: TotalCreditsGivenDto })
  @ValidateNested()
  @Type(() => TotalCreditsGivenDto)
  given: TotalCreditsGivenDto;

  @ApiProperty()
  utilisedTotal: number;

  @ApiPropertyOptional({
    description: 'Net circulating unspent credit balance',
  })
  @IsOptional()
  circulatingBalance?: number;
}

export class ReportTotalResponseDto {
  @ApiProperty({ type: TotalUsersReportDto })
  @ValidateNested()
  @Type(() => TotalUsersReportDto)
  users: TotalUsersReportDto;

  @ApiProperty({ type: TotalIdentitiesReportDto })
  @ValidateNested()
  @Type(() => TotalIdentitiesReportDto)
  identities: TotalIdentitiesReportDto;

  @ApiProperty({ type: TotalDevicesReportDto })
  @ValidateNested()
  @Type(() => TotalDevicesReportDto)
  devices: TotalDevicesReportDto;

  @ApiProperty({ type: TotalLikesReportDto })
  @ValidateNested()
  @Type(() => TotalLikesReportDto)
  likes: TotalLikesReportDto;

  @ApiProperty({ type: TotalMatchesReportDto })
  @ValidateNested()
  @Type(() => TotalMatchesReportDto)
  matches: TotalMatchesReportDto;

  @ApiProperty({ type: BlocksReportDto })
  @ValidateNested()
  @Type(() => BlocksReportDto)
  blocks: BlocksReportDto;

  @ApiProperty({ type: TotalCreditsReportDto })
  @ValidateNested()
  @Type(() => TotalCreditsReportDto)
  credits: TotalCreditsReportDto;

  @ApiPropertyOptional({ type: TotalFinancialSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TotalFinancialSummaryDto)
  financial?: TotalFinancialSummaryDto;

  @ApiPropertyOptional({ type: TotalChatSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TotalChatSummaryDto)
  chat?: TotalChatSummaryDto;
}

// TIMEFRAME REPORT DTOs
export class TimeframeUsersReportDto {
  @ApiProperty()
  acquired: number;

  @ApiProperty({ type: DemographicsDto })
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics: DemographicsDto;
}

export class TimeframeIdentitiesReportDto {
  @ApiProperty()
  created: number;

  @ApiPropertyOptional({ description: 'Identities claimed in timeframe' })
  @IsOptional()
  claimed?: number;

  @ApiPropertyOptional({
    description: 'Unclaimed identities created in timeframe',
  })
  @IsOptional()
  unclaimed?: number;

  @ApiPropertyOptional({
    description: 'Average identities per acquired user in timeframe',
  })
  @IsOptional()
  averagePerUser?: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  split: IdentitySplitDto;
}

export class TimeframeDevicesReportDto {
  @ApiProperty()
  registered: number;

  @ApiPropertyOptional({
    description: 'Average devices per acquired user in timeframe',
  })
  @IsOptional()
  averagePerUser?: number;

  @ApiProperty({ type: PlatformSplitDto })
  @ValidateNested()
  @Type(() => PlatformSplitDto)
  platformSplit: PlatformSplitDto;
}

export class TimeframeLikesReportDto {
  @ApiProperty()
  made: number;

  @ApiPropertyOptional({
    description: 'Average likes per acquired user in timeframe',
  })
  @IsOptional()
  averagePerUser?: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  targetIdentitySplit: IdentitySplitDto;

  @ApiProperty({ type: IntentSplitDto })
  @ValidateNested()
  @Type(() => IntentSplitDto)
  intentSplit: IntentSplitDto;

  @ApiPropertyOptional({ type: LikeStatusSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LikeStatusSummaryDto)
  statusSplit?: LikeStatusSummaryDto;
}

export class TimeframeMatchesReportDto {
  @ApiProperty()
  matched: number;

  @ApiPropertyOptional({
    description: 'Average matches per acquired user in timeframe',
  })
  @IsOptional()
  averagePerUser?: number;

  @ApiPropertyOptional({
    description: 'Match conversion rate as (2 * matches / likes) * 100',
  })
  @IsOptional()
  conversionRatePercent?: number;

  @ApiPropertyOptional({ type: MatchStatusSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchStatusSummaryDto)
  statusSplit?: MatchStatusSummaryDto;
}

export class TimeframeCreditsGivenDto {
  @ApiProperty()
  total: number;

  @ApiProperty({ type: CreditsGivenSplitDto })
  @ValidateNested()
  @Type(() => CreditsGivenSplitDto)
  splitBySource: CreditsGivenSplitDto;
}

export class TimeframeCreditsReportDto {
  @ApiProperty({ type: TimeframeCreditsGivenDto })
  @ValidateNested()
  @Type(() => TimeframeCreditsGivenDto)
  given: TimeframeCreditsGivenDto;

  @ApiProperty()
  utilisedTotal: number;

  @ApiPropertyOptional({
    description: 'Net circulating unspent credit balance in timeframe',
  })
  @IsOptional()
  circulatingBalance?: number;
}

export class ReportTimeframeResponseDto {
  @ApiProperty({ type: TimeframeDto })
  @ValidateNested()
  @Type(() => TimeframeDto)
  timeframe: TimeframeDto;

  @ApiProperty({ type: TimeframeUsersReportDto })
  @ValidateNested()
  @Type(() => TimeframeUsersReportDto)
  users: TimeframeUsersReportDto;

  @ApiProperty({ type: TimeframeIdentitiesReportDto })
  @ValidateNested()
  @Type(() => TimeframeIdentitiesReportDto)
  identities: TimeframeIdentitiesReportDto;

  @ApiProperty({ type: TimeframeDevicesReportDto })
  @ValidateNested()
  @Type(() => TimeframeDevicesReportDto)
  devices: TimeframeDevicesReportDto;

  @ApiProperty({ type: TimeframeLikesReportDto })
  @ValidateNested()
  @Type(() => TimeframeLikesReportDto)
  likes: TimeframeLikesReportDto;

  @ApiProperty({ type: TimeframeMatchesReportDto })
  @ValidateNested()
  @Type(() => TimeframeMatchesReportDto)
  matches: TimeframeMatchesReportDto;

  @ApiProperty({ type: BlocksReportDto })
  @ValidateNested()
  @Type(() => BlocksReportDto)
  blocks: BlocksReportDto;

  @ApiProperty({ type: TimeframeCreditsReportDto })
  @ValidateNested()
  @Type(() => TimeframeCreditsReportDto)
  credits: TimeframeCreditsReportDto;

  @ApiPropertyOptional({ type: TotalFinancialSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TotalFinancialSummaryDto)
  financial?: TotalFinancialSummaryDto;

  @ApiPropertyOptional({ type: TotalChatSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TotalChatSummaryDto)
  chat?: TotalChatSummaryDto;
}

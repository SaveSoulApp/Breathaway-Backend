import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

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
}

export class TotalMatchesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  averagePerUser: number;
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

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  split: IdentitySplitDto;
}

export class TimeframeDevicesReportDto {
  @ApiProperty()
  registered: number;

  @ApiProperty({ type: PlatformSplitDto })
  @ValidateNested()
  @Type(() => PlatformSplitDto)
  platformSplit: PlatformSplitDto;
}

export class TimeframeLikesReportDto {
  @ApiProperty()
  made: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  targetIdentitySplit: IdentitySplitDto;

  @ApiProperty({ type: IntentSplitDto })
  @ValidateNested()
  @Type(() => IntentSplitDto)
  intentSplit: IntentSplitDto;
}

export class TimeframeMatchesReportDto {
  @ApiProperty()
  matched: number;
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
}

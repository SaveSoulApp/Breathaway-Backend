import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class TimeframeDto {
  @ApiProperty({ nullable: true })
  startDate: Date | null;

  @ApiProperty({ nullable: true })
  endDate: Date | null;
}

class DemographicsDto {
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

class UsersReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  acquiredInTimeframe: number;

  @ApiProperty()
  completedProfiles: number;

  @ApiProperty({ type: DemographicsDto })
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics: DemographicsDto;
}

class IdentitySplitDto {
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

class IdentitiesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  averagePerUser: number;

  @ApiProperty({ type: IdentitySplitDto })
  @ValidateNested()
  @Type(() => IdentitySplitDto)
  split: IdentitySplitDto;
}

class PlatformSplitDto {
  @ApiProperty()
  android: number;

  @ApiProperty()
  ios: number;
}

class DevicesReportDto {
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

class IntentStatsDto {
  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

class IntentSplitDto {
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

class LikesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  totalInTimeframe: number;

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

class MatchesReportDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  totalInTimeframe: number;

  @ApiProperty()
  averagePerUser: number;
}

class BlocksReportDto {
  @ApiProperty()
  total: number;
}

class CreditsGivenSplitDto {
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

class CreditsGivenDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  inTimeframe: number;

  @ApiProperty({ type: CreditsGivenSplitDto })
  @ValidateNested()
  @Type(() => CreditsGivenSplitDto)
  splitBySource: CreditsGivenSplitDto;
}

class CreditsUtilisedDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  inTimeframe: number;
}

class CreditsReportDto {
  @ApiProperty({ type: CreditsGivenDto })
  @ValidateNested()
  @Type(() => CreditsGivenDto)
  given: CreditsGivenDto;

  @ApiProperty({ type: CreditsUtilisedDto })
  @ValidateNested()
  @Type(() => CreditsUtilisedDto)
  utilised: CreditsUtilisedDto;
}

export class ReportResponseDto {
  @ApiProperty({ type: TimeframeDto })
  @ValidateNested()
  @Type(() => TimeframeDto)
  timeframe: TimeframeDto;

  @ApiProperty({ type: UsersReportDto })
  @ValidateNested()
  @Type(() => UsersReportDto)
  users: UsersReportDto;

  @ApiProperty({ type: IdentitiesReportDto })
  @ValidateNested()
  @Type(() => IdentitiesReportDto)
  identities: IdentitiesReportDto;

  @ApiProperty({ type: DevicesReportDto })
  @ValidateNested()
  @Type(() => DevicesReportDto)
  devices: DevicesReportDto;

  @ApiProperty({ type: LikesReportDto })
  @ValidateNested()
  @Type(() => LikesReportDto)
  likes: LikesReportDto;

  @ApiProperty({ type: MatchesReportDto })
  @ValidateNested()
  @Type(() => MatchesReportDto)
  matches: MatchesReportDto;

  @ApiProperty({ type: BlocksReportDto })
  @ValidateNested()
  @Type(() => BlocksReportDto)
  blocks: BlocksReportDto;

  @ApiProperty({ type: CreditsReportDto })
  @ValidateNested()
  @Type(() => CreditsReportDto)
  credits: CreditsReportDto;
}

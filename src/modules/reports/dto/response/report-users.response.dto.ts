import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { DemographicsDto, PlatformSplitDto } from './report.response.dto';

export class AgeBracketsDto {
  @ApiProperty({ description: 'Users aged 18 to 24' })
  age18To24: number;

  @ApiProperty({ description: 'Users aged 25 to 34' })
  age25To34: number;

  @ApiProperty({ description: 'Users aged 35 to 44' })
  age35To44: number;

  @ApiProperty({ description: 'Users aged 45 and above' })
  age45Plus: number;

  @ApiProperty({ description: 'Users with unspecified date of birth' })
  unknown: number;
}

export class UserDemographicsFullDto {
  @ApiProperty({ type: DemographicsDto })
  @ValidateNested()
  @Type(() => DemographicsDto)
  gender: DemographicsDto;

  @ApiProperty({ type: AgeBracketsDto })
  @ValidateNested()
  @Type(() => AgeBracketsDto)
  ageBrackets: AgeBracketsDto;
}

export class CountryDistributionDto {
  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'IN',
  })
  countryCode: string;

  @ApiProperty({ description: 'User count registered in this country' })
  count: number;

  @ApiProperty({
    description: 'Percentage of total geographically mapped users',
  })
  percentage: number;
}

export class AppVersionDistributionDto {
  @ApiProperty({ description: 'Device platform', example: 'IOS' })
  platform: string;

  @ApiProperty({ description: 'Application version string', example: '1.2.0' })
  version: string;

  @ApiProperty({ description: 'Active device count reporting this version' })
  count: number;
}

export class UserDevicesReportDto {
  @ApiProperty({ description: 'Total registered devices' })
  total: number;

  @ApiProperty({ description: 'Active devices' })
  active: number;

  @ApiProperty({ type: PlatformSplitDto })
  @ValidateNested()
  @Type(() => PlatformSplitDto)
  platformSplit: PlatformSplitDto;

  @ApiProperty({ type: [AppVersionDistributionDto] })
  @ValidateNested({ each: true })
  @Type(() => AppVersionDistributionDto)
  appVersions: AppVersionDistributionDto[];
}

export class ReportUsersResponseDto {
  @ApiProperty({ description: 'Total registered users' })
  total: number;

  @ApiProperty({ description: 'Active users in the past 30 days' })
  active30d: number;

  @ApiProperty({ description: 'Completed profiles count' })
  completedProfiles: number;

  @ApiProperty({ type: UserDemographicsFullDto })
  @ValidateNested()
  @Type(() => UserDemographicsFullDto)
  demographics: UserDemographicsFullDto;

  @ApiProperty({ type: [CountryDistributionDto] })
  @ValidateNested({ each: true })
  @Type(() => CountryDistributionDto)
  geography: CountryDistributionDto[];

  @ApiProperty({ type: UserDevicesReportDto })
  @ValidateNested()
  @Type(() => UserDevicesReportDto)
  devices: UserDevicesReportDto;
}

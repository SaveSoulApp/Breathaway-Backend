import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

export enum ReportTrendInterval {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum ReportTrendMetric {
  USERS = 'users',
  REVENUE = 'revenue',
  LIKES = 'likes',
  MATCHES = 'matches',
  MESSAGES = 'messages',
  ORDERS = 'orders',
}

export class GetReportTrendsRequestDto {
  @ApiPropertyOptional({
    description: 'Aggregation interval for the time-series points',
    enum: ReportTrendInterval,
    default: ReportTrendInterval.DAY,
    example: ReportTrendInterval.DAY,
  })
  @IsOptional()
  @IsEnum(ReportTrendInterval)
  interval?: ReportTrendInterval = ReportTrendInterval.DAY;

  @ApiPropertyOptional({
    description: 'The specific metric to aggregate over the timeline',
    enum: ReportTrendMetric,
    default: ReportTrendMetric.USERS,
    example: ReportTrendMetric.USERS,
  })
  @IsOptional()
  @IsEnum(ReportTrendMetric)
  metric?: ReportTrendMetric = ReportTrendMetric.USERS;

  @ApiPropertyOptional({
    description: 'Start date of the timeframe to generate trends for',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date of the timeframe to generate trends for',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

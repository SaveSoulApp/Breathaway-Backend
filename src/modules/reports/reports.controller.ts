import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '@modules/admin/guards/admin-oidc-auth.guard';

import {
  GetReportRequestDto,
  GetReportTrendsRequestDto,
  ReportEngagementResponseDto,
  ReportFinancialResponseDto,
  ReportSummaryResponseDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
  ReportTrendsResponseDto,
  ReportUsersResponseDto,
} from './dto';
import { ReportsService } from './reports.service';

/**
 * Administrative Reporting Controller.
 *
 * Exposes comprehensive platform analytics, financial metrics, engagement insights,
 * demographics, and time-series trends designed directly for executive dashboards
 * featuring KPI banners, pie charts, and bar/line charts.
 *
 * Secured by Google Cloud OIDC Bearer Token authentication via `AdminOidcAuthGuard`.
 */
@ApiTags('Reports')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'reports',
  version: ['1'],
})
@UseGuards(AdminOidcAuthGuard)
@ApiBearerAuth('gcp-oidc')
export class ReportsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly reportsService: ReportsService,
  ) {
    super(logger);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Executive dashboard KPI summary banners',
    description:
      'Provides instant executive KPI card metrics covering registered/active users, gross revenue, subscriptions, viral backlog, matches, and chats.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved dashboard summary metrics.',
    type: ReportSummaryResponseDto,
  })
  async getSummary(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportSummaryResponseDto> {
    return this.reportsService.getSummaryReport(query);
  }

  @Get('users')
  @ApiOperation({
    summary: 'User demographics, geography, and device distribution',
    description:
      'Retrieves user demographic distributions (gender, age brackets 18-24/25-34/35-44/45+), country geographic splits, and active device app versions for pie and donut charts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user demographics report.',
    type: ReportUsersResponseDto,
  })
  async getUsersReport(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportUsersResponseDto> {
    return this.reportsService.getUsersReport(query);
  }

  @Get('engagement')
  @ApiOperation({
    summary: 'Social engagement, viral loop, likes, and chat metrics',
    description:
      'Retrieves social engagement breakdowns including claimed vs unclaimed viral identities, like status funnel, mutual match intent pairings, chat room activity, and safety blocks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved engagement report.',
    type: ReportEngagementResponseDto,
  })
  async getEngagementReport(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportEngagementResponseDto> {
    return this.reportsService.getEngagementReport(query);
  }

  @Get('financial')
  @ApiOperation({
    summary: 'Monetary revenue, payment gateways, orders, and subscriptions',
    description:
      'Retrieves financial intelligence including multi-currency gross revenue, gateway distribution (RevenueCat, Razorpay, Cashfree, Decentro), channel splits (iOS, Android, Web), order conversion, and active subscriptions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved financial report.',
    type: ReportFinancialResponseDto,
  })
  async getFinancialReport(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportFinancialResponseDto> {
    return this.reportsService.getFinancialReport(query);
  }

  @Get('trends')
  @ApiOperation({
    summary: 'Time-series trends for bar and line charts',
    description:
      'Generates interval-bucketed time-series data (day, week, or month) for users, revenue, likes, matches, messages, or payment orders, directly feedable into dashboard charts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved time-series trend data.',
    type: ReportTrendsResponseDto,
  })
  async getTrends(
    @Query() query: GetReportTrendsRequestDto,
  ): Promise<ReportTrendsResponseDto> {
    return this.reportsService.getTrendsReport(query);
  }

  @Get('total')
  @ApiOperation({
    summary: 'Generate absolute overall administrative report',
    description:
      'Retrieves total aggregated platform statistics without timeframe bounds (enriched with WEB platform and like/match status splits).',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated the total report.',
    type: ReportTotalResponseDto,
  })
  async getTotalReport(): Promise<ReportTotalResponseDto> {
    return this.reportsService.generateTotalReport();
  }

  @Get('timeframe')
  @ApiOperation({
    summary: 'Generate a timeframe-bounded administrative report',
    description:
      'Retrieves aggregated platform statistics strictly within a specified timeframe (enriched with WEB platform and like/match status splits).',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated the timeframe report.',
    type: ReportTimeframeResponseDto,
  })
  async getTimeframeReport(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportTimeframeResponseDto> {
    return this.reportsService.generateTimeframeReport(query);
  }
}

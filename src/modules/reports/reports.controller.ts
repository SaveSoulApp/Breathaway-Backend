import { ApiStandardErrors } from '@common/decorators';
import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetReportRequestDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
} from './dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@SkipClientIdentity()
@ApiStandardErrors()
@Controller({
  path: 'reports',
  version: ['1'],
})
@UseGuards(AdminBasicAuthGuard)
@ApiBasicAuth()
export class ReportsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly reportsService: ReportsService,
  ) {
    super(logger);
  }

  @Get('total')
  @ApiOperation({
    summary: 'Generate absolute overall administrative report',
    description:
      'Retrieves total aggregated platform statistics without any timeframe bounds.',
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
      'Retrieves aggregated platform statistics strictly within a specified timeframe. If no dates are passed, evaluates everything until today.',
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

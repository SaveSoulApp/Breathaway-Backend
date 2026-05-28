import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  GetReportRequestDto,
  ReportTimeframeResponseDto,
  ReportTotalResponseDto,
} from './dto';
import { AdminBasicAuthGuard } from './guards/admin-basic-auth.guard';

@ApiTags('Admin')
@Controller({
  path: 'admin',
  version: ['1'],
})
@UseGuards(AdminBasicAuthGuard)
@ApiBasicAuth()
export class AdminController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly adminService: AdminService,
  ) {
    super(logger);
  }

  @Get('reports/total')
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
    return this.adminService.generateTotalReport();
  }

  @Get('reports/timeframe')
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
    return this.adminService.generateTimeframeReport(query);
  }
}

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
import { GetReportRequestDto, ReportResponseDto } from './dto';
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

  @Get('reports')
  @ApiOperation({
    summary: 'Generate an administrative report',
    description:
      'Retrieves aggregated platform statistics. Can be optionally filtered by a timeframe.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated the report.',
    type: ReportResponseDto,
  })
  async getReport(
    @Query() query: GetReportRequestDto,
  ): Promise<ReportResponseDto> {
    return this.adminService.generateReport(query);
  }
}

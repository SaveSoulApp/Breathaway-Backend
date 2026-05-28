import { Controller, Get, Query, UseGuards, HttpStatus } from '@nestjs/common';
import { BaseController } from '@core/base';
import { BasicAuthGuard } from '@common/guards/basic-auth.guard';
import { LoggerService } from '@core/logger';
import { InstagramService } from './instagram.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Instagram')
@Controller({
  path: 'instagram',
  version: ['1'],
})
@UseGuards(BasicAuthGuard)
export class InstagramController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly instagramService: InstagramService,
  ) {
    super(logger);
  }

  @Get('refresh-token')
  @ApiOperation({ summary: 'Refresh Instagram user access token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User access token refreshed successfully',
  })
  async refresh(@Query('token') token: string): Promise<unknown> {
    return this.instagramService.refreshAccessToken(token);
  }

  @Get('refresh-env-token')
  @ApiOperation({ summary: 'Refresh Instagram system access token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'System access token refreshed successfully',
  })
  async refreshEnvToken(): Promise<unknown> {
    return this.instagramService.refreshSystemAccessToken();
  }
}

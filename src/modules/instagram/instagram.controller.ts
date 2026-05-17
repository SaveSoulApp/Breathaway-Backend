import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BaseController } from '@core/base/base.controller';
import { BasicAuthGuard } from '@common/guards/basic-auth.guard';
import { LoggerService } from '@core/logger';
import { InstagramService } from './instagram.service';

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
  async refresh(@Query('token') token: string) {
    return this.instagramService.refreshAccessToken(token);
  }

  @Get('refresh-env-token')
  async refreshEnvToken() {
    return this.instagramService.refreshSystemAccessToken();
  }
}

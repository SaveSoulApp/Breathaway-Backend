import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BaseController } from 'src/base/controller/base.controller';
import { LoggerService } from 'src/core/logger/logger.service';
import { MetaWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';

@Controller({
  path: 'webhooks',
  version: ['1'],
})
export class WebhooksController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly webhookService: WebhooksService,
  ) {
    super(logger);
  }

  @Get('meta')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhookService.verifyMetaWebhook(mode, token, challenge);
  }

  @Post('meta')
  async handleMetaWebhook(@Body() body: MetaWebhookDto) {
    this.logger.log('Meta webhook received', { object: body.object });

    const results = this.webhookService.parseMetaWebhook(body);
    await this.webhookService.handleMetaWebhookEvents(results);

    return 'EVENT_RECEIVED';
  }
}

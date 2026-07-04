import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MetaWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Webhooks')
@Controller({
  path: 'webhooks',
  version: ['1'],
})
@SkipClientIdentity()
export class WebhooksController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly webhookService: WebhooksService,
  ) {
    super(logger);
  }

  @Get('meta')
  @ApiOperation({ summary: 'Verify Meta Webhook' })
  @ApiResponse({
    status: 200,
    description: 'Webhook successfully verified',
  })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhookService.verifyMetaWebhook(mode, token, challenge);
  }

  @Post('meta')
  @ApiOperation({ summary: 'Handle Meta Webhook events' })
  @ApiResponse({
    status: 201,
    description: 'Events successfully received',
  })
  async handleMetaWebhook(@Body() body: MetaWebhookDto) {
    this.logger.debug('Meta webhook received', { object: body.object });

    const results = this.webhookService.parseMetaWebhook(body);
    await this.webhookService.handleMetaWebhookEvents(results);

    return 'EVENT_RECEIVED';
  }
}

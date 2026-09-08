import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { MetaWebhookDto, RevenueCatWebhookRequestDto } from './dto';
import { WebhooksService } from './webhooks.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

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

  /**
   * Receives RevenueCat purchase notifications and grants the corresponding credits.
   *
   * The body is deliberately typed as a plain object rather than a DTO class.
   * The application-wide `ValidationPipe` runs with `forbidNonWhitelisted: true`
   * and a route-level pipe does not replace it — both execute — so binding a DTO
   * here would reject any property RevenueCat adds later. Real purchases already
   * carry `discount_*` fields the dashboard's test event lacks, and a 400 would
   * simply be retried into the same wall until the event expired. A plain object
   * metatype makes the pipe skip validation; the parser checks the shape instead.
   * `RevenueCatWebhookRequestDto` documents the payload for Swagger.
   *
   * Every outcome the system cannot act on (an unmapped product, an unresolvable
   * customer, a redelivered event) still answers 200: retrying those would never
   * succeed. Genuine faults propagate so the delivery is retried.
   */
  @Post('revenuecat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle RevenueCat purchase webhook events' })
  @ApiBody({ type: RevenueCatWebhookRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Event received and processed',
  })
  async handleRevenueCatWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    const event = this.webhookService.parseRevenueCatWebhook(body);

    this.logger.debug('RevenueCat webhook received', {
      providerEventType: event.providerEventType,
      gatewayTransactionId: event.gatewayTransactionId,
      productId: event.productId,
      environment: event.environment,
    });

    await this.webhookService.handlePurchaseEvent(event);

    return { status: 'ok' };
  }
}

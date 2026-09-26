import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  MetaWebhookDto,
  RazorpayWebhookRequestDto,
  RevenueCatWebhookRequestDto,
} from './dto';
import { RazorpayWebhookGuard, RevenueCatWebhookGuard } from './guards';
import { RazorpayPaymentHandler } from './handlers/razorpay-payment.handler';
import { WebhooksService } from './webhooks.service';

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
    private readonly razorpayPaymentHandler: RazorpayPaymentHandler,
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
   * Authenticates incoming requests via `RevenueCatWebhookGuard` using HMAC-SHA256
   * signature verification (`X-RevenueCat-Webhook-Signature`).
   *
   * Validates payload against `RevenueCatWebhookRequestDto`. Because third-party webhooks
   * evolve over time (e.g. `discount_*` fields on real purchases), the DTO is annotated
   * with `@AllowNonWhitelisted()`, which signals `AppValidationPipe` to accept newly added
   * properties without throwing `400 Bad Request`.
   *
   * Every outcome the system cannot act on (an unmapped product, an unresolvable
   * customer, a redelivered event) still answers 200: retrying those would never
   * succeed. Genuine faults propagate so the delivery is retried.
   */
  @Post('revenuecat')
  @UseGuards(RevenueCatWebhookGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle RevenueCat purchase webhook events' })
  @ApiHeader({
    name: 'X-RevenueCat-Webhook-Signature',
    description:
      'RevenueCat HMAC-SHA256 delivery signature (format: t=<unix_timestamp>,v1=<hmac_hex>)',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Event received and processed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid RevenueCat webhook signature',
  })
  async handleRevenueCatWebhook(
    @Body() dto: RevenueCatWebhookRequestDto,
  ): Promise<{ status: string }> {
    const event = this.webhookService.parseRevenueCatWebhook(dto);

    this.logger.debug('RevenueCat webhook received', {
      providerEventType: event.providerEventType,
      gatewayTransactionId: event.gatewayTransactionId,
      productId: event.productId,
      environment: event.environment,
    });

    await this.webhookService.handlePurchaseEvent(event);

    return { status: 'ok' };
  }

  /**
   * Receives Razorpay payment notifications and fulfils the corresponding order.
   *
   * Protected by `RazorpayWebhookGuard` which verifies the `X-Razorpay-Signature`
   * HMAC-SHA256 header against the raw body bytes.
   *
   * Idempotent: a redelivered `payment.captured` for an already-PAID order is
   * detected by the `@@unique([gateway, gatewayTransactionId])` constraint on
   * `Transaction` and silently skipped (returns 200).
   *
   * Events this handler does not recognise are acknowledged (200) and ignored —
   * retrying them would never succeed.
   */
  @Post('payments/razorpay')
  @UseGuards(RazorpayWebhookGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle Razorpay payment webhook events',
    description:
      'Signature-verified, unauthenticated endpoint. Fulfils orders on payment.captured. ' +
      'Idempotent — redeliveries of already-processed events return 200 without re-granting.',
  })
  @ApiHeader({
    name: 'X-Razorpay-Signature',
    description: 'Razorpay HMAC-SHA256 webhook signature (hex-encoded).',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Event received and processed.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid Razorpay webhook signature.',
  })
  async handleRazorpayWebhook(
    @Body() dto: RazorpayWebhookRequestDto,
  ): Promise<{ status: string }> {
    this.logger.debug('Razorpay webhook received', {
      event: dto.event,
      eventId: dto.event_id,
      paymentId: dto.payload?.payment?.entity?.id,
      orderId: dto.payload?.payment?.entity?.order_id,
    });

    if (this.razorpayPaymentHandler.canHandle(dto)) {
      await this.razorpayPaymentHandler.handle(dto);
    }

    return { status: 'ok' };
  }
}

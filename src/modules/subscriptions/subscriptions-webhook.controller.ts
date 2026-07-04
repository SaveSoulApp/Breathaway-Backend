import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrencyCode,
  StorePlatform,
  SubscriptionEventType,
} from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import {
  AppleNotificationRequestDto,
  GoogleNotificationRequestDto,
} from './dto';
import { AppleSubscriptionService } from './services/apple-subscription.service';
import { GoogleSubscriptionService } from './services/google-subscription.service';
import { SubscriptionsService } from './services/subscriptions.service';

/**
 * Handles incoming Server-to-Server billing notifications from Apple App Store
 * and Google Play.
 *
 * Decodes the raw store payloads, resolves product and transaction details,
 * maps them to our internal subscription event state machine, and processes
 * the state change.
 */
@ApiTags('Subscriptions Webhooks')
@Controller({
  path: 'subscriptions/webhooks',
  version: ['1'],
})
export class SubscriptionsWebhookController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly appleService: AppleSubscriptionService,
    private readonly googleService: GoogleSubscriptionService,
  ) {
    super(logger);
  }

  /**
   * Receives and processes Apple App Store Server-to-Server notifications.
   *
   * Accepts signed JWS payloads from StoreKit 2, decodes them, and processes the event.
   *
   * @param dto - Contains the cryptographically signed notification payload.
   * @returns An object acknowledging receipt.
   */
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apple App Store Server-to-Server webhook' })
  @ApiResponse({ status: HttpStatus.OK })
  async handleAppleNotification(
    @Body() dto: AppleNotificationRequestDto,
  ): Promise<{ status: string }> {
    try {
      const notification = this.appleService.parseNotification(
        dto.signedPayload,
      );

      const { transactionInfo } = notification;

      const eventType = this.appleService.mapNotificationType(
        notification.notificationType,
        notification.subtype,
      );

      const currencyCode = transactionInfo.currency
        ? (transactionInfo.currency as CurrencyCode)
        : undefined;

      await this.routeSubscriptionEvent({
        eventType,
        storePlatform: StorePlatform.APPLE,
        storeTransactionId: transactionInfo.originalTransactionId,
        storeProductId: transactionInfo.productId,
        purchaseDate: new Date(transactionInfo.purchaseDate),
        expiresDate: new Date(transactionInfo.expiresDate),
        currencyCode,
        pricePaid: transactionInfo.price
          ? transactionInfo.price / 1000
          : undefined,
        countryCode: transactionInfo.storefront,
        rawPayload: notification.rawPayload,
        storeEventId: transactionInfo.transactionId,
      });

      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Failed to process Apple notification', {
        step: 'handle_apple_notification',
        err: serializeError(error),
      });
      // Return 200 to prevent Apple from retrying on business logic errors
      return { status: 'error' };
    }
  }

  /**
   * Receives and processes Google Play Real-Time Developer Notifications.
   *
   * Google sends a base64 encoded payload via Pub/Sub or direct webhook.
   * The notification is parsed, and the purchase token is verified against the
   * Google Play Developer API to determine the event type.
   *
   * @param dto - Contains the encoded message payload from Google.
   * @returns An object acknowledging receipt.
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google Play Real-Time Developer Notification webhook',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async handleGoogleNotification(
    @Body() dto: GoogleNotificationRequestDto,
  ): Promise<{ status: string }> {
    try {
      const notification = this.googleService.parseNotification(
        dto.message.data,
      );

      if (!notification.subscriptionNotification) {
        this.logger.warn(
          'Received Google notification without subscription data',
          {
            packageName: notification.packageName,
            step: 'handle_google_notification',
          },
        );
        return { status: 'ignored' };
      }

      const { subscriptionNotification } = notification;

      const eventType = this.googleService.mapNotificationType(
        subscriptionNotification.notificationType,
      );

      // Verify purchase and get details from Google Play API
      let purchaseDetails;
      try {
        purchaseDetails = await this.googleService.verifyPurchase(
          notification.packageName,
          subscriptionNotification.subscriptionId,
          subscriptionNotification.purchaseToken,
        );
      } catch {
        this.logger.warn('Failed to verify Google purchase — skipping event', {
          purchaseToken: subscriptionNotification.purchaseToken,
          step: 'handle_google_notification',
        });
        return { status: 'verification_failed' };
      }

      const currencyCode = this.resolveCurrencyCode(
        purchaseDetails.priceCurrencyCode,
      );

      const pricePaid = purchaseDetails.priceAmountMicros
        ? Number(purchaseDetails.priceAmountMicros) / 1_000_000
        : undefined;

      await this.routeSubscriptionEvent({
        eventType,
        storePlatform: StorePlatform.GOOGLE,
        storeTransactionId: subscriptionNotification.purchaseToken,
        storeProductId: subscriptionNotification.subscriptionId,
        purchaseDate: new Date(purchaseDetails.startTime),
        expiresDate: new Date(purchaseDetails.expiryTime),
        currencyCode,
        pricePaid,
        countryCode: purchaseDetails.countryCode,
        rawPayload: notification as unknown as Record<string, unknown>,
        storeEventId: dto.message.messageId,
      });

      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Failed to process Google notification', {
        step: 'handle_google_notification',
        err: serializeError(error),
      });
      return { status: 'error' };
    }
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async routeSubscriptionEvent(params: {
    eventType: SubscriptionEventType;
    storePlatform: StorePlatform;
    storeTransactionId: string;
    storeProductId: string;
    purchaseDate: Date;
    expiresDate: Date;
    currencyCode?: CurrencyCode;
    pricePaid?: number;
    countryCode?: string;
    rawPayload?: Record<string, unknown>;
    storeEventId?: string;
  }): Promise<void> {
    const {
      eventType,
      storePlatform,
      storeTransactionId,
      storeProductId,
      purchaseDate,
      expiresDate,
      rawPayload,
      storeEventId,
    } = params;

    switch (eventType) {
      case SubscriptionEventType.INITIAL_PURCHASE:
        // C1 fix: Initial subscriptions are created via the client-initiated
        // POST /subscriptions/verify-purchase endpoint. When a webhook
        // INITIAL_PURCHASE arrives, the subscription should already exist.
        // handleInitialPurchase is idempotent — it returns the existing
        // subscription if found, so this is safe as a reconciliation path.
        //
        // However, we need a userId which webhooks don't provide. If the
        // subscription already exists (created via verify-purchase), great.
        // If not, we can't create one without a userId — log and move on.
        try {
          const existing =
            await this.subscriptionsService.findSubscriptionByStoreTransaction(
              storeTransactionId,
            );
          this.logger.debug(
            `INITIAL_PURCHASE webhook: subscription "${existing.id}" already exists — no action needed`,
            { subscriptionId: existing.id, step: 'route_event' },
          );
        } catch {
          this.logger.warn(
            'INITIAL_PURCHASE webhook received but no matching subscription found. ' +
              'The client should call POST /subscriptions/verify-purchase first.',
            {
              storeTransactionId,
              storeProductId,
              storePlatform,
              step: 'route_event',
            },
          );
        }
        break;

      case SubscriptionEventType.RENEWAL:
        await this.subscriptionsService.handleRenewal({
          storeTransactionId,
          storePlatform,
          newPeriodStart: purchaseDate,
          newPeriodEnd: expiresDate,
          rawPayload,
          storeEventId,
        });
        break;

      case SubscriptionEventType.CANCELLATION:
        await this.subscriptionsService.handleCancellation({
          storeTransactionId,
          storePlatform,
          rawPayload,
          storeEventId,
        });
        break;

      case SubscriptionEventType.GRACE_PERIOD_ENTERED:
        await this.subscriptionsService.handleGracePeriod({
          storeTransactionId,
          storePlatform,
          rawPayload,
          storeEventId,
        });
        break;

      case SubscriptionEventType.BILLING_RECOVERY:
        await this.subscriptionsService.handleBillingRecovery({
          storeTransactionId,
          storePlatform,
          newPeriodEnd: expiresDate,
          rawPayload,
          storeEventId,
        });
        break;

      case SubscriptionEventType.REVOCATION:
      case SubscriptionEventType.REFUND:
        await this.subscriptionsService.handleRevocation({
          storeTransactionId,
          storePlatform,
          rawPayload,
          storeEventId,
        });
        break;

      case SubscriptionEventType.EXPIRY:
        await this.subscriptionsService.handleExpiry(
          storeTransactionId,
          storePlatform,
        );
        break;

      default:
        this.logger.warn('Unhandled subscription event type', {
          eventType,
          storePlatform,
          storeTransactionId,
          step: 'route_event',
        });
    }
  }

  /**
   * Safely maps a currency string from the store to our CurrencyCode enum.
   * Returns undefined if the currency is not in our supported list.
   */
  private resolveCurrencyCode(currency?: string): CurrencyCode | undefined {
    if (!currency) return undefined;

    const upper = currency.toUpperCase();
    if (Object.values(CurrencyCode).includes(upper as CurrencyCode)) {
      return upper as CurrencyCode;
    }

    this.logger.warn('Unsupported currency code from store', {
      currency: upper,
      step: 'resolve_currency',
    });
    return undefined;
  }
}

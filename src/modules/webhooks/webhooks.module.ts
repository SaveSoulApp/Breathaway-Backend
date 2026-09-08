import { CreditsModule } from '@modules/credits/credits.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { TransactionsModule } from '@modules/transactions/transactions.module';
import { Module } from '@nestjs/common';
import { GenericMessageHandler } from './handlers/generic-message.handler';
import { OtpVerificationHandler } from './handlers/otp-verification.handler';
import { RevenueCatPurchaseHandler } from './handlers/revenuecat-purchase.handler';
import {
  WEBHOOK_MESSAGE_HANDLERS,
  WEBHOOK_PURCHASE_HANDLERS,
} from './webhooks.constants';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Inbound webhook surface for every third party that calls us — Meta today,
 * payment gateways alongside it.
 *
 * Imports:
 *   - TransactionsModule: records the gateway-side money event.
 *   - CreditsModule: grants the credits a purchase buys.
 *   - SubscriptionsModule: maps a store product ID to its credit allocation.
 */
@Module({
  imports: [TransactionsModule, CreditsModule, SubscriptionsModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    OtpVerificationHandler,
    GenericMessageHandler,
    RevenueCatPurchaseHandler,
    {
      provide: WEBHOOK_MESSAGE_HANDLERS,
      useFactory: (
        otp: OtpVerificationHandler,
        generic: GenericMessageHandler,
      ) => [otp, generic],
      inject: [OtpVerificationHandler, GenericMessageHandler],
    },
    {
      provide: WEBHOOK_PURCHASE_HANDLERS,
      useFactory: (revenueCat: RevenueCatPurchaseHandler) => [revenueCat],
      inject: [RevenueCatPurchaseHandler],
    },
  ],
})
export class WebhooksModule {}

import { Module } from '@nestjs/common';

import { IpGeolocationModule } from '@infrastructure/ip-geolocation';
import { CreditsModule } from '@modules/credits/credits.module';
import { TransactionsModule } from '@modules/transactions/transactions.module';

import { RazorpayGateway } from './gateways/razorpay/razorpay.gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsReconciliationService } from './payments.reconciliation';
import { PaymentsService } from './payments.service';

/**
 * Encapsulates the web payment bounded context — order creation, gateway routing,
 * client-side verification, and reconciliation of stale PENDING orders.
 *
 * ## Imports
 * - `CreditsModule`: `CreditsService` is used inside the atomic fulfillment
 *   `$transaction` to grant credits on a successful payment.
 * - `TransactionsModule`: `TransactionsService` records the gateway-side event
 *   as a `Transaction` row, providing the idempotency key.
 * - `IpGeolocationModule`: country code fallback for users without a phone-derived
 *   `countryCode` on their `User` row.
 *
 * ## Exports
 * - `PaymentsService`: exported so `WebhooksModule` can call `fulfil()` from the
 *   Razorpay webhook handler without duplicating the fulfillment logic.
 */
@Module({
  imports: [CreditsModule, TransactionsModule, IpGeolocationModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsReconciliationService, RazorpayGateway],
  exports: [PaymentsService],
})
export class PaymentsModule {}

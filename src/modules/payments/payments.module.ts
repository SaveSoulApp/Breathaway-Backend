import { Module } from '@nestjs/common';

import { IpGeolocationModule } from '@infrastructure/ip-geolocation';
import { CreditsModule } from '@modules/credits/credits.module';
import { IdentitiesModule } from '@modules/identities/identities.module';
import { TransactionsModule } from '@modules/transactions/transactions.module';

import { RazorpayGateway } from './gateways/razorpay/razorpay.gateway';
import { PaymentRoutesService } from './payment-routes.service';
import { PaymentsController } from './payments.controller';
import { PaymentsReconciliationService } from './payments.reconciliation';
import { PaymentsService } from './payments.service';

/**
 * Encapsulates the web payment bounded context — order creation, gateway routing,
 * administrative route management, client-side verification, and reconciliation.
 *
 * ## Imports
 * - `CreditsModule`: `CreditsService` is used inside the atomic fulfillment
 *   `$transaction` to grant credits on a successful payment.
 * - `TransactionsModule`: `TransactionsService` records the gateway-side event
 *   as a `Transaction` row, providing the idempotency key.
 * - `IpGeolocationModule`: country code fallback for users without a phone-derived
 *   `countryCode` on their `User` row.
 * - `IdentitiesModule`: `IdentitiesService` resolves and decrypts the user's verified
 *   phone number for gateway checkout prefill.
 *
 * ## Exports
 * - `PaymentsService`: exported so `WebhooksModule` can call `fulfil()` from the
 *   Razorpay webhook handler without duplicating the fulfillment logic.
 * - `PaymentRoutesService`: exported for administrative operations (`AdminModule`) and tests.
 */
@Module({
  imports: [
    CreditsModule,
    TransactionsModule,
    IpGeolocationModule,
    IdentitiesModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsReconciliationService,
    PaymentRoutesService,
    RazorpayGateway,
  ],
  exports: [PaymentsService, PaymentRoutesService],
})
export class PaymentsModule {}

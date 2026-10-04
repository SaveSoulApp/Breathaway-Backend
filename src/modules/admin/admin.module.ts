import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { CreditsModule } from '@modules/credits/credits.module';
import { PaymentRoutesAdminController } from '@modules/payments/payment-routes-admin.controller';
import { PaymentsModule } from '@modules/payments/payments.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SubscriptionsAdminController } from './subscriptions/subscriptions-admin.controller';

@Module({
  imports: [AuthModule, CreditsModule, PaymentsModule, SubscriptionsModule],
  controllers: [
    AdminController,
    SubscriptionsAdminController,
    PaymentRoutesAdminController,
  ],
  providers: [AdminService],
})
export class AdminModule {}

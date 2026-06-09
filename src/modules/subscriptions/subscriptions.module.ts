import { CreditsModule } from '@modules/credits/credits.module';
import { Module } from '@nestjs/common';
import { AppleSubscriptionService } from './services/apple-subscription.service';
import { GoogleSubscriptionService } from './services/google-subscription.service';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { SubscriptionsAdminController } from './subscriptions-admin.controller';
import { SubscriptionsWebhookController } from './subscriptions-webhook.controller';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [CreditsModule],
  controllers: [
    SubscriptionsController,
    SubscriptionsAdminController,
    SubscriptionsWebhookController,
  ],
  providers: [
    SubscriptionsService,
    SubscriptionPlansService,
    AppleSubscriptionService,
    GoogleSubscriptionService,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

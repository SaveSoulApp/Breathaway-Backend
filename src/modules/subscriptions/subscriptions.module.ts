import { CreditsModule } from '@modules/credits/credits.module';
import { Module } from '@nestjs/common';
import { AppleSubscriptionService } from './services/apple-subscription.service';
import { GoogleSubscriptionService } from './services/google-subscription.service';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { SubscriptionsWebhookController } from './subscriptions-webhook.controller';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Encapsulates the subscription management bounded context — creating and managing
 * billing plans, validating in-app purchases, and processing lifecycle webhooks.
 *
 * Imports:
 *   - CreditsModule: required for automatically granting credits upon purchase or renewal.
 *
 * Exports:
 *   - SubscriptionsService: exposed so other modules can query user subscription status.
 *   - SubscriptionPlansService: exposed so AdminModule can manage plans.
 */
@Module({
  imports: [CreditsModule],
  controllers: [SubscriptionsController, SubscriptionsWebhookController],
  providers: [
    SubscriptionsService,
    SubscriptionPlansService,
    AppleSubscriptionService,
    GoogleSubscriptionService,
  ],
  exports: [SubscriptionsService, SubscriptionPlansService],
})
export class SubscriptionsModule {}

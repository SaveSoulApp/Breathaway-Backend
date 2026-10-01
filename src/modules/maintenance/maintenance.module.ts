import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CreditsModule } from '@modules/credits/credits.module';
import { InstagramModule } from '@modules/instagram/instagram.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';

import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * Encapsulates scheduled maintenance jobs — data-hygiene tasks that run on a
 * cron schedule via GCP Cloud Scheduler, triggered through the internal
 * /internal/jobs HTTP endpoints.
 *
 * Imports:
 *   - ConfigModule: provides ConfigService so MaintenanceService can read
 *     `CREDIT_EXPIRY_BATCH_SIZE` from the application configuration.
 *   - CreditsModule: provides credit expiry domain operations.
 *   - InstagramModule: provides InstagramService for monthly token rotation.
 *   - PaymentsModule: provides payment order reconciliation.
 *   - SubscriptionsModule: provides subscription expiry operations.
 *
 * PubSubPublisherService is available globally via PubSubModule (@Global) and
 * requires no explicit import here.
 *
 * No exports — this module is a leaf consumer; no other module depends on it.
 */
@Module({
  imports: [
    ConfigModule,
    CreditsModule,
    InstagramModule,
    PaymentsModule,
    SubscriptionsModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}

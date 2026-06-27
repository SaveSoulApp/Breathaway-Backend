import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
 *
 * PubSubPublisherService is available globally via PubSubModule (@Global) and
 * requires no explicit import here.
 *
 * No exports — this module is a leaf consumer; no other module depends on it.
 */
@Module({
  imports: [ConfigModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}

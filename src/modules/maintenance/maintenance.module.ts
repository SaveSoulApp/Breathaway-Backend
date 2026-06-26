import { CreditsModule } from '@modules/credits/credits.module';
import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * Encapsulates scheduled maintenance jobs — data-hygiene tasks that run on a
 * cron schedule via GCP Cloud Scheduler, triggered through the internal
 * /internal/jobs HTTP endpoints.
 *
 * Imports:
 *   - CreditsModule: provides CreditsService so the maintenance job can invoke
 *     credit-bundle expiration without re-implementing the expiry logic.
 *
 * No exports — this module is a leaf consumer; no other module depends on it.
 */
@Module({
  imports: [CreditsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}

import { CreditsModule } from '@modules/credits/credits.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [CreditsModule, SubscriptionsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}


import { CreditsModule } from '@modules/credits/credits.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SubscriptionsAdminController } from './subscriptions/subscriptions-admin.controller';

@Module({
  imports: [CreditsModule, SubscriptionsModule],
  controllers: [AdminController, SubscriptionsAdminController],
  providers: [AdminService],
})
export class AdminModule {}

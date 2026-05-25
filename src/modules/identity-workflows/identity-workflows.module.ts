import { IdentityModule } from '@modules/identities/identities.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OtpModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { IdentityWorkflowsController } from './identity-workflows.controller';
import { IdentityWorkflowsService } from './identity-workflows.service';

@Module({
  imports: [
    OtpModule,
    SocialidentityModule,
    IdentityModule,
    NotificationsModule,
  ],
  controllers: [IdentityWorkflowsController],
  providers: [IdentityWorkflowsService],
})
export class IdentityWorkflowsModule {}

import { IdentitiesModule } from '@modules/identities/identities.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { IdentityWorkflowsController } from './identity-workflows.controller';
import { IdentityWorkflowsService } from './identity-workflows.service';

@Module({
  imports: [
    OneTimePasswordsModule,
    SocialIdentitiesModule,
    IdentitiesModule,
    NotificationsModule,
    MatchResolverModule,
  ],
  controllers: [IdentityWorkflowsController],
  providers: [IdentityWorkflowsService],
})
export class IdentityWorkflowsModule {}

import { IdentitiesModule } from '@modules/identities/identities.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { IdentityWorkflowsController } from './identity-workflows.controller';
import { IdentityWorkflowsService } from './identity-workflows.service';

/**
 * Orchestrates multi-step identity verification and matching workflows triggered
 * by Pub/Sub events such as Instagram OTP receipts and identity claims.
 *
 * Imports:
 *   - OneTimePasswordsModule: provides OTP verification to authenticate the identity
 *     claim originating from an Instagram DM.
 *   - SocialIdentitiesModule: resolves Instagram sender IDs to platform identity records.
 *   - IdentitiesModule: claims or creates the verified identity and links it to the user.
 *   - NotificationsModule: dispatches push notifications after successful identity linking.
 *   - MatchResolverModule: runs match resolution against pre-existing likes that targeted
 *     newly claimed identities, completing deferred match flows.
 */
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

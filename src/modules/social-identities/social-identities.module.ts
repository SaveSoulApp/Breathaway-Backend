import { Module } from '@nestjs/common';
import { SocialIdentitiesController } from './social-identities.controller';
import { SocialidentitiesService } from './social-identities.service';

/**
 * Encapsulates social identity verification — currently Instagram — allowing
 * the platform to confirm a user's real-world social presence before linking
 * it to their profile.
 *
 * Imports: none — verification is performed via direct HTTP calls to the
 *   Instagram Graph API using a server-side access token.
 *
 * Exports:
 *   - SocialidentitiesService: exposed so profile and auth modules can trigger
 *     Instagram verification without re-declaring the provider.
 */
@Module({
  controllers: [SocialIdentitiesController],
  providers: [SocialidentitiesService],
  exports: [SocialidentitiesService],
})
export class SocialIdentitiesModule {}

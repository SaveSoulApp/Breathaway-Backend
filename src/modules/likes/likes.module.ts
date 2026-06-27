import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { CreditsModule } from '@modules/credits/credits.module';
import { IdentitiesModule } from '@modules/identities/identities.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { Module } from '@nestjs/common';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

/**
 * Encapsulates the likes bounded context — recording a user's intent to connect
 * with another person's identity and triggering mutual-match detection.
 *
 * Imports:
 *   - IdentityCryptoModule: hashes and normalises raw identity values (phone numbers,
 *     handles) before they are stored or compared.
 *   - IdentitiesModule: resolves and decrypts target identities so that the likes
 *     response can include the plaintext publicValue for display.
 *   - MatchResolverModule: checks after every new like whether a mutual match has
 *     formed and transitions both likes to MATCHED status accordingly.
 */
@Module({
  imports: [
    IdentityCryptoModule,
    IdentitiesModule,
    MatchResolverModule,
    CreditsModule,
  ],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}

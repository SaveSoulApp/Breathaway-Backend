import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { Module } from '@nestjs/common';
import { IdentitiesController } from './identities.controller';
import { IdentitiesService } from './identities.service';

/**
 * Encapsulates the identities bounded context — managing the full lifecycle of a user's
 * verifiable contact identities (phone numbers, email addresses, social handles).
 *
 * All plaintext identity values are encrypted at rest by IdentityCryptoService before
 * being persisted; only hashed and masked representations are stored in the clear.
 *
 * Imports:
 *   - IdentityCryptoModule: provides symmetric-envelope encryption/decryption and
 *     deterministic hashing for `publicValue` and `platformId` fields.
 *
 * Exports:
 *   - IdentitiesService: exposes `claimOrCreateIdentity`, `getDecryptedPublicValue`,
 *     and `findByPublicValue` so auth flows (OAuth claim) and likes display can
 *     resolve and decrypt identities without creating a circular dependency.
 */
@Module({
  imports: [IdentityCryptoModule],
  controllers: [IdentitiesController],
  providers: [IdentitiesService],
  exports: [IdentitiesService],
})
export class IdentitiesModule {}

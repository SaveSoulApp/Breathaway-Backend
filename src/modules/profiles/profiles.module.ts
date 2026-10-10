import { Module } from '@nestjs/common';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';

import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/**
 * Encapsulates the user profile bounded context — creating, reading, updating,
 * and soft-deleting a user's profile and associated account data (identities,
 * auth credentials, devices).
 *
 * Imports:
 *   - IdentityCryptoModule: Provides envelope encryption and decryption for sensitive PII (firstName, lastName).
 *
 * Exports:
 *   - None: `ProfilesService` is not consumed by any other module; profile
 *     data access is always routed through this module's HTTP layer.
 */
@Module({
  imports: [IdentityCryptoModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}

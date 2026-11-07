import { forwardRef, Module } from '@nestjs/common';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { IdentitiesModule } from '@modules/identities/identities.module';

import { EmailIdentitiesController } from './email-identities.controller';
import { EmailVerificationService } from './email-verification.service';

/**
 * Sub-module encapsulating email identity verification and linking.
 *
 * Imports:
 *   - IdentityCryptoModule: provides envelope encryption and deterministic hashing.
 *   - IdentitiesModule: provides core identity persistence via claimOrCreateIdentity.
 *
 * Exports:
 *   - EmailVerificationService: allows other modules to verify or query email OTP state if needed.
 */
@Module({
  imports: [IdentityCryptoModule, forwardRef(() => IdentitiesModule)],
  controllers: [EmailIdentitiesController],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailIdentitiesModule {}

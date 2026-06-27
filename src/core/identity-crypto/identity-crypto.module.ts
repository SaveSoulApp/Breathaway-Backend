import { Module } from '@nestjs/common';
import { KmsModule } from '@core/kms/kms.module';
import { IdentityCryptoService } from './identity-crypto.service';

/**
 * Encapsulates cryptographic operations for sensitive identity information.
 *
 * Centralizes the logic for envelope encryption, deterministic hashing, and data masking,
 * abstracting the complexities of KMS interactions and AES-GCM from the rest of the application.
 *
 * Imports:
 *   - KmsModule: Provides the key management service used to wrap and unwrap data keys and compute blinded hashes.
 *
 * Exports:
 *   - IdentityCryptoService: Exposed for identity workflows to securely encrypt and decrypt PII.
 */
@Module({
  imports: [KmsModule],
  providers: [IdentityCryptoService],
  exports: [IdentityCryptoService],
})
export class IdentityCryptoModule {}

import { Global, Module } from '@nestjs/common';
import { GcpSecretManagerService } from './gcp-secret-manager.service';

/**
 * Provides access to Google Cloud Secret Manager for storing and updating sensitive credentials securely.
 *
 * Registered as a `@Global()` module so that `GcpSecretManagerService` is universally available
 * across the application without needing to be re-imported in feature modules.
 *
 * Exports:
 *   - GcpSecretManagerService: Exposed for interacting with the GCP Secret Manager API.
 */
@Global()
@Module({
  providers: [GcpSecretManagerService],
  exports: [GcpSecretManagerService],
})
export class GcpSecretManagerModule {}

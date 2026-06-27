import { Module, Provider } from '@nestjs/common';
import { CloudKmsKeyManager } from './cloud-kms-key-manager.service';
import { GcpSecretsKeyManager } from './gcp-secrets-key-manager.service';

const useCloud = process.env.USE_GOOGLE_CLOUD_KMS === 'true';

const keyManagerProvider: Provider = {
  provide: 'KEY_MANAGER',
  useClass: useCloud ? CloudKmsKeyManager : GcpSecretsKeyManager,
};

/**
 * Provides cryptographic key management services for envelope encryption workflows.
 *
 * Dynamically provisions either `CloudKmsKeyManager` or `GcpSecretsKeyManager` based on the
 * `USE_GOOGLE_CLOUD_KMS` environment flag, allowing seamless transition between local/secret-based
 * development and production GCP KMS environments.
 *
 * Exports:
 *   - KEY_MANAGER: A custom provider token exposing the chosen `IKeyManager` implementation.
 */
@Module({
  providers: [keyManagerProvider, GcpSecretsKeyManager, CloudKmsKeyManager],
  exports: ['KEY_MANAGER'],
})
export class KmsModule {}

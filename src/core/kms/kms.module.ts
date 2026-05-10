import { Module, Provider } from '@nestjs/common';
import { CloudKmsKeyManager } from './cloud-kms-key-manager.service';
import { GcpSecretsKeyManager } from './gcp-secrets-key-manager.service';

const useCloud = process.env.USE_GOOGLE_CLOUD_KMS === 'true';

const keyManagerProvider: Provider = {
  provide: 'KEY_MANAGER',
  useClass: useCloud ? CloudKmsKeyManager : GcpSecretsKeyManager,
};

@Module({
  providers: [keyManagerProvider, GcpSecretsKeyManager, CloudKmsKeyManager],
  exports: ['KEY_MANAGER'],
})
export class KmsModule {}

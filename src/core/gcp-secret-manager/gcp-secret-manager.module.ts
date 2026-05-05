import { Global, Module } from '@nestjs/common';
import { GcpSecretManagerService } from './gcp-secret-manager.service';

@Global()
@Module({
  providers: [GcpSecretManagerService],
  exports: [GcpSecretManagerService],
})
export class GcpSecretManagerModule {}

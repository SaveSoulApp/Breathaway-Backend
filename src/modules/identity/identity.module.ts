import { Module } from '@nestjs/common';
import { KmsModule } from 'src/core/kms/kms.module';
import { IdentityEncryptionService } from './identity-encryption.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [KmsModule],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityEncryptionService],
  exports: [IdentityService, IdentityEncryptionService],
})
export class IdentityModule {}

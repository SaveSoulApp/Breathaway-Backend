import { Module } from '@nestjs/common';
import { KmsModule } from '@core/kms/kms.module';
import { IdentityCryptoService } from './identity-crypto.service';

@Module({
  imports: [KmsModule],
  providers: [IdentityCryptoService],
  exports: [IdentityCryptoService],
})
export class IdentityCryptoModule {}

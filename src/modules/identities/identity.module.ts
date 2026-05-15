import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from 'src/core/identity-crypto/identity-crypto.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [IdentityCryptoModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}

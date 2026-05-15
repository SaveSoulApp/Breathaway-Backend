import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { IdentityController } from './identities.controller';
import { IdentityService } from './identities.service';

@Module({
  imports: [IdentityCryptoModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}

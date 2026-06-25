import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { Module } from '@nestjs/common';
import { IdentitiesController } from './identities.controller';
import { IdentitiesService } from './identities.service';

@Module({
  imports: [IdentityCryptoModule],
  controllers: [IdentitiesController],
  providers: [IdentitiesService],
  exports: [IdentitiesService],
})
export class IdentitiesModule {}

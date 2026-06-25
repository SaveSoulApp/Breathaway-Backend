import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { IdentitiesModule } from '@modules/identities/identities.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { Module } from '@nestjs/common';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

@Module({
  imports: [IdentityCryptoModule, IdentitiesModule, MatchResolverModule],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}

import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

@Module({
  imports: [IdentityCryptoModule, MatchResolverModule],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}

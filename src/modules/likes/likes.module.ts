import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { LikeController } from './likes.controller';
import { LikeService } from './likes.service';

@Module({
  imports: [IdentityCryptoModule, MatchResolverModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}

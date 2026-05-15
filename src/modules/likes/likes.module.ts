import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from 'src/core/identity-crypto/identity-crypto.module';
import { MatchResolverModule } from 'src/modules/match-resolver/match-resolver.module';
import { LikeController } from './likes.controller';
import { LikeService } from './likes.service';

@Module({
  imports: [IdentityCryptoModule, MatchResolverModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}

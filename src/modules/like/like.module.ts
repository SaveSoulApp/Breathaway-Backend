import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from 'src/core/identity-crypto/identity-crypto.module';
import { MatchResolverModule } from 'src/modules/match-resolver/match-resolver.module';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';

@Module({
  imports: [IdentityCryptoModule, MatchResolverModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}

import { Module } from '@nestjs/common';
import { IdentityCryptoModule } from 'src/core/identity-crypto/identity-crypto.module';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';

@Module({
  imports: [IdentityCryptoModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}

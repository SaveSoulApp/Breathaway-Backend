import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';

@Module({
  imports: [IdentityModule],
  controllers: [LikeController],
  providers: [LikeService],
})
export class LikeModule {}

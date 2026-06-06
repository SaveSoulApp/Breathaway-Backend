import { Module } from '@nestjs/common';
import { SocialIdentitiesController } from './social-identities.controller';
import { SocialidentitiesService } from './social-identities.service';

@Module({
  controllers: [SocialIdentitiesController],
  providers: [SocialidentitiesService],
  exports: [SocialidentitiesService],
})
export class SocialIdentitiesModule {}

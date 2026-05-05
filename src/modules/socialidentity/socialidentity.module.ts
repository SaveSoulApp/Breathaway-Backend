import { Module } from '@nestjs/common';
import { SocialidentityController } from './socialidentity.controller';
import { SocialidentityService } from './socialidentity.service';

@Module({
  controllers: [SocialidentityController],
  providers: [SocialidentityService],
})
export class SocialidentityModule {}

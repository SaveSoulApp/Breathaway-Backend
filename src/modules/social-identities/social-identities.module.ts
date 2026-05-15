import { Module } from '@nestjs/common';
import { SocialidentityController } from './social-identities.controller';
import { SocialidentityService } from './social-identities.service';

@Module({
  controllers: [SocialidentityController],
  providers: [SocialidentityService],
})
export class SocialidentityModule {}

import { Module } from '@nestjs/common';
import { ProfileController } from './profiles.controller';
import { ProfileService } from './profiles.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}

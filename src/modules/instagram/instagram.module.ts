import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramScheduler } from './instagram.scheduler';
import { InstagramService } from './instagram.service';

@Module({
  controllers: [InstagramController],
  providers: [InstagramService, InstagramScheduler],
})
export class InstagramModule {}

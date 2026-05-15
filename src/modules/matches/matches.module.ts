import { Module } from '@nestjs/common';
import { BlockModule } from '../blocks/blocks.module';
import { MatchController } from './matches.controller';
import { MatchService } from './matches.service';

@Module({
  imports: [BlockModule],
  controllers: [MatchController],
  providers: [MatchService],
  exports: [MatchService],
})
export class MatchModule {}

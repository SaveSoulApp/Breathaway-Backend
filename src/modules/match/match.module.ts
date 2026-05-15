import { Module } from '@nestjs/common';
import { BlockModule } from '../block/block.module';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';

@Module({
  imports: [BlockModule],
  controllers: [MatchController],
  providers: [MatchService],
  exports: [MatchService],
})
export class MatchModule {}

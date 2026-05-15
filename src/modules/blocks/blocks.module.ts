import { Module } from '@nestjs/common';
import { BlockController } from './blocks.controller';
import { BlockService } from './blocks.service';

@Module({
  controllers: [BlockController],
  providers: [BlockService],
  exports: [BlockService],
})
export class BlockModule {}

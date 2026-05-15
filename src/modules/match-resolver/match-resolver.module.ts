import { Module } from '@nestjs/common';
import { BlockModule } from '../block/block.module';
import { MatchModule } from '../match/match.module';
import { MatchResolverService } from './match-resolver.service';

@Module({
  imports: [MatchModule, BlockModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

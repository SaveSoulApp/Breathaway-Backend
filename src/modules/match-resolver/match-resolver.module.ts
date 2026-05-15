import { Module } from '@nestjs/common';
import { BlockModule } from '../blocks/block.module';
import { MatchModule } from '../matches/match.module';
import { MatchResolverService } from './match-resolver.service';

@Module({
  imports: [MatchModule, BlockModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

import { Module } from '@nestjs/common';
import { BlockModule } from '../blocks/blocks.module';
import { MatchModule } from '../matches/matches.module';
import { MatchResolverService } from './match-resolver.service';

@Module({
  imports: [MatchModule, BlockModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

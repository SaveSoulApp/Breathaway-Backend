import { BlockModule } from '@modules/blocks/blocks.module';
import { MatchModule } from '@modules/matches/matches.module';
import { Module } from '@nestjs/common';
import { MatchResolverService } from './match-resolver.service';

@Module({
  imports: [MatchModule, BlockModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

import { BlocksModule } from '@modules/blocks/blocks.module';
import { MatchesModule } from '@modules/matches/matches.module';
import { Module } from '@nestjs/common';
import { MatchResolverService } from './match-resolver.service';

@Module({
  imports: [MatchesModule, BlocksModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

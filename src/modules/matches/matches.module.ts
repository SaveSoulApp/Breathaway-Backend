import { BlocksModule } from '@modules/blocks/blocks.module';
import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

/**
 * Encapsulates the matches bounded context — listing active matches, retrieving
 * match details, and allowing users to unmatch from one another.
 *
 * Imports:
 *   - BlocksModule: provides BlocksService so the match logic can consult
 *     the block list when needed (e.g., filtering out blocked users).
 *
 * Exports:
 *   - MatchesService: shared with MatchResolverModule so the resolver can call
 *     `isIntentCompatible` without duplicating the intent-matching logic.
 */
@Module({
  imports: [BlocksModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}

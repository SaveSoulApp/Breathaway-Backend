import { BlocksModule } from '@modules/blocks/blocks.module';
import { MatchesModule } from '@modules/matches/matches.module';
import { Module } from '@nestjs/common';
import { MatchResolverService } from './match-resolver.service';

import { NotificationsModule } from '@modules/notifications/notifications.module';

/**
 * Provides the match resolution engine that fires after a new like is created.
 *
 * This module is deliberately headless (no controller) — it exposes
 * MatchResolverService to be called synchronously from the likes domain
 * immediately after a like is persisted.
 *
 * Imports:
 *   - MatchesModule: provides MatchesService for intent-compatibility checks
 *     and access to the canonical match record.
 *   - BlocksModule: provides BlocksService so the resolver can suppress matches
 *     between users who have blocked each other.
 *   - NotificationsModule: provides NotificationsService for async dispatching of match events.
 *
 * Exports:
 *   - MatchResolverService: consumed by LikesModule to trigger match evaluation
 *     after each successful like without creating a circular dependency.
 */
@Module({
  imports: [MatchesModule, BlocksModule, NotificationsModule],
  providers: [MatchResolverService],
  exports: [MatchResolverService],
})
export class MatchResolverModule {}

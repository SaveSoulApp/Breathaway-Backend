import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';

/**
 * Encapsulates Instagram Graph API integration — refreshing user and system
 * access tokens to keep long-lived credentials valid before they expire.
 *
 * Providers:
 *   - InstagramController: exposes admin-only HTTP endpoints for token refresh operations.
 *   - InstagramService: orchestrates Graph API calls and persists refreshed tokens
 *     to GCP Secret Manager.
 */
@Module({
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}

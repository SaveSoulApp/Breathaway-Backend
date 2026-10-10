import { Module } from '@nestjs/common';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';

import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/**
 * Encapsulates the user-blocking bounded context — creating, listing, and soft-deleting block relationships.
 *
 * `BlocksService` is exported so sibling modules (e.g. `LikesModule`, `MessagingModule`) can call
 * `isBlocked()` to gate interactions between users without importing the full module.
 */
@Module({
  imports: [IdentityCryptoModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}

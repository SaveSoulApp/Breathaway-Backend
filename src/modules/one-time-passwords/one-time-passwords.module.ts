import { Module } from '@nestjs/common';

import { OneTimePasswordsController } from './one-time-passwords.controller';
import { OneTimePasswordsService } from './one-time-passwords.service';

/**
 * Provides OTP generation and verification backed by Redis for ephemeral,
 * rate-limited, single-use token storage.
 *
 * Injects RedisService provided by the global RedisModule.
 *
 * Exports:
 *   - OneTimePasswordsService: allows other modules to generate or verify OTPs.
 */
@Module({
  controllers: [OneTimePasswordsController],
  providers: [OneTimePasswordsService],
  exports: [OneTimePasswordsService],
})
export class OneTimePasswordsModule {}

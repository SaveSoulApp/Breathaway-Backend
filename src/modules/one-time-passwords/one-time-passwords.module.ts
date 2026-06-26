import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { OneTimePasswordsController } from './one-time-passwords.controller';
import { OneTimePasswordsService } from './one-time-passwords.service';

/**
 * Provides OTP generation and verification backed by Redis for ephemeral,
 * rate-limited, single-use token storage.
 *
 * Bootstraps its own Redis connection via a `REDIS_CLIENT` factory provider
 * so the connection is isolated to this module's concerns. Consumers that need
 * OTP verification (e.g., the auth module for identity bridging) can import
 * this module to receive both the service and the shared Redis client.
 *
 * Imports: none — Redis is instantiated internally via `ConfigService`.
 *
 * Exports:
 *   - OneTimePasswordsService: allows other modules to generate or verify OTPs.
 *   - REDIS_CLIENT: re-exported so dependent modules can share the same Redis
 *     connection without creating a second one.
 */
@Module({
  controllers: [OneTimePasswordsController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL environment variable is not defined');
        }
        return new Redis(redisUrl);
      },
    },
    OneTimePasswordsService,
  ],
  exports: [OneTimePasswordsService, 'REDIS_CLIENT'],
})
export class OneTimePasswordsModule {}

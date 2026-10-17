import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { serializeError } from '@common/utils/error.utils';
import { LoggerService } from '@core/logger';

import { REDIS_CLIENT } from './redis.constants';

/**
 * Factory provider for the singleton Redis client connection pool.
 *
 * Configures lazy connection and bounded retries to prevent blocking
 * application startup or crashing container pods when Redis is temporarily
 * unavailable or optional.
 */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService, LoggerService],
  useFactory: (
    config: ConfigService,
    loggerService: LoggerService,
  ): Redis | null => {
    const logger = loggerService.forContext('RedisModule');
    const redisUrl = config.get<string>('REDIS_URL');

    if (!redisUrl) {
      logger.warn(
        'REDIS_URL environment variable is not defined; Redis client is disabled',
      );
      return null;
    }

    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    client.on('error', (err) => {
      logger.error('Redis client connection error', {
        err: serializeError(err),
      });
    });

    return client;
  },
};

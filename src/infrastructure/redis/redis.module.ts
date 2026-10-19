import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import Redis from 'ioredis';

import { safeCloseClient } from '@common/utils/cleanup.utils';
import { LoggerService } from '@core/logger';

import { REDIS_CLIENT } from './redis.constants';
import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';
import { ThrottlerStorageRedisService } from './throttler-storage-redis.service';

/**
 * Global infrastructure module providing the singleton Redis connection pool
 * and RedisService, managing graceful teardown during container termination.
 */
@Global()
@Module({
  providers: [redisProvider, RedisService, ThrottlerStorageRedisService],
  exports: [REDIS_CLIENT, RedisService, ThrottlerStorageRedisService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis | null,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Gracefully quits the Redis connection pool on application shutdown,
   * draining any in-flight commands and preventing lingering socket handles.
   *
   * @param signal - OS termination signal (e.g. SIGTERM, SIGINT).
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    const logger = this.loggerService.forContext(RedisModule.name);
    logger.log(
      `Application shutdown (${signal ?? 'SIGTERM'}); closing Redis connection pool...`,
      { step: 'shutdown' },
    );
    if (this.redisClient) {
      await safeCloseClient(this.redisClient, logger, 'Redis', 'quit');
    }
  }
}

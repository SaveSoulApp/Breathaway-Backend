import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { RedisService } from '@infrastructure/redis';

/**
 * Health indicator verifying active Redis cache and token storage connectivity.
 *
 * Injects `RedisService` and gracefully handles environments where Redis is
 * unconfigured (`redisService.isConfigured === false`), reporting healthy with
 * `enabled: false` rather than causing readiness probe failures.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redisService: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /**
   * Pings the Redis instance to verify network connectivity and responsiveness.
   *
   * @param key - Unique indicator key (defaults to 'redis').
   * @returns HealthIndicatorResult indicating 'up' (or 'up' with enabled: false) or 'down'.
   */
  async isHealthy(key: string = 'redis'): Promise<HealthIndicatorResult> {
    if (!this.redisService.isConfigured) {
      return this.healthIndicatorService.check(key).up({
        enabled: false,
        message: 'Redis is not configured',
      });
    }

    try {
      await this.redisService.ping();
      return this.healthIndicatorService.check(key).up();
    } catch (error) {
      return this.healthIndicatorService.check(key).down({
        message: (error as Error).message,
      });
    }
  }
}

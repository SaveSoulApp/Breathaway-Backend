import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * Health module orchestrating liveness and readiness diagnostics
 * via `@nestjs/terminus` for GCP Cloud Run and Kubernetes probes.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator],
  exports: [DatabaseHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}

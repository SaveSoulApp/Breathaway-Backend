import { Controller, Get, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

import { SkipClientIdentity } from '@common/decorators/skip-client-identity.decorator';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { HealthResponseDto, ReadyResponseDto } from './dto';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@SkipClientIdentity()
@Controller({
  version: VERSION_NEUTRAL,
})
export class HealthController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly databaseHealthIndicator: DatabaseHealthIndicator,
    private readonly redisHealthIndicator: RedisHealthIndicator,
  ) {
    super(logger);
  }

  /**
   * Liveness probe for GCP Cloud Run and GKE load balancers.
   *
   * Fast, non-blocking check validating Node.js event loop responsiveness and
   * process memory bounds. Never queries downstream network dependencies to
   * prevent cascading container restarts during external transient blips.
   *
   * Mounted at app root /health without API versioning prefix.
   * Unauthenticated and bypasses client identity checks.
   *
   * @returns 200 OK with Terminus health details when alive.
   */
  @Get('health')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is alive',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Service memory thresholds exceeded',
  })
  async checkHealth(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }

  /**
   * Readiness probe for GCP Cloud Run and GKE load balancers.
   *
   * Verifies PostgreSQL database connectivity and Redis cache responsiveness
   * before admitting incoming user traffic to this container revision.
   *
   * Mounted at app root /ready without API versioning prefix.
   *
   * @returns 200 OK with Terminus dependency status when ready.
   * @throws {ServiceUnavailableException} When any required dependency is unreachable.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is ready to handle traffic',
    type: ReadyResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Service is not ready (database or cache unreachable)',
  })
  async checkReady(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.databaseHealthIndicator.isHealthy('database'),
      () => this.redisHealthIndicator.isHealthy('redis'),
    ]);
  }
}

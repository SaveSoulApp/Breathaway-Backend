import { PrismaService } from '@infrastructure/database/prisma.service';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

@ApiTags('Health')
@Controller({
  path: 'health',
  version: ['1'],
})
export class HealthController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    private readonly redisHealthIndicator: RedisHealthIndicator,
  ) {
    super(logger);
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check system health' })
  check() {
    return this.health.check([
      () =>
        this.prismaHealthIndicator.pingCheck('database', this.prismaService),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),
      () => this.redisHealthIndicator.isHealthy('redis'),
    ]);
  }
}

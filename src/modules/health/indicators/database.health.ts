import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { PrismaService } from '@infrastructure/database/prisma.service';

/**
 * Health indicator verifying active PostgreSQL database connectivity via Prisma.
 *
 * Executes a lightweight `SELECT 1` query to test connection pool responsiveness
 * without relying on Terminus's built-in PrismaHealthIndicator (which internally
 * assumes MongoDB driver behavior and fails on PostgreSQL clients).
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /**
   * Pings PostgreSQL to ensure the connection pool is healthy and accepting queries.
   *
   * @param key - Unique indicator key (defaults to 'database').
   * @returns HealthIndicatorResult indicating 'up' or 'down'.
   */
  async isHealthy(key: string = 'database'): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.healthIndicatorService.check(key).up();
    } catch (error) {
      return this.healthIndicatorService.check(key).down({
        message: (error as Error).message,
      });
    }
  }
}

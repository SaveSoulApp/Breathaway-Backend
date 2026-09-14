import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, PoolConfig } from 'pg';

import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Service managing the database connection and Prisma client lifecycle.
 *
 * Configures the underlying Node-Postgres connection pool (`pg.Pool`) with bounded
 * limits and acquisition timeouts tailored for stateless GCP Cloud Run autoscaling.
 * This prevents database connection starvation when Cloud Run scales horizontally.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger: ContextualLogger;

  constructor(configService: ConfigService, loggerService: LoggerService) {
    const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

    // Parse pool options with resilient serverless defaults
    const max = Number(configService.get<number>('DB_POOL_MAX', 4));
    const min = Number(configService.get<number>('DB_POOL_MIN', 0));
    const connectionTimeoutMillis = Number(
      configService.get<number>('DB_POOL_ACQUISITION_TIMEOUT_MS', 5000),
    );
    const idleTimeoutMillis = Number(
      configService.get<number>('DB_POOL_IDLE_TIMEOUT_MS', 10000),
    );
    const statementTimeout = Number(
      configService.get<number>('DB_POOL_STATEMENT_TIMEOUT_MS', 15000),
    );

    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
      max: Number.isFinite(max) && max > 0 ? max : 4,
      min: Number.isFinite(min) && min >= 0 ? min : 0,
      connectionTimeoutMillis:
        Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis > 0
          ? connectionTimeoutMillis
          : 5000,
      idleTimeoutMillis:
        Number.isFinite(idleTimeoutMillis) && idleTimeoutMillis >= 0
          ? idleTimeoutMillis
          : 10000,
      statement_timeout:
        Number.isFinite(statementTimeout) && statementTimeout >= 0
          ? statementTimeout
          : 15000,
    };

    const pool = new Pool(poolConfig);
    super({ adapter: new PrismaPg(pool) });

    this.pool = pool;
    this.logger = loggerService.forContext('PrismaService');

    // Prevent unhandled errors from dropping idle clients and crashing the Node.js process
    this.pool.on('error', (err: Error) => {
      this.logger.error(
        'Unexpected error on idle PostgreSQL connection pool client',
        {
          step: 'idle_client_error',
          error: err.message,
          stack: err.stack,
        },
      );
    });

    this.logger.info('Initialized bounded PostgreSQL connection pool', {
      step: 'init_pool',
      max: poolConfig.max,
      min: poolConfig.min,
      connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
      idleTimeoutMillis: poolConfig.idleTimeoutMillis,
      statement_timeout: poolConfig.statement_timeout,
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.info('Connecting Prisma to database...', {
      step: 'connect_db_init',
    });
    await this.$connect();
    this.logger.info('Prisma connected successfully.', {
      step: 'connect_db_success',
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.info('Draining Prisma connection pool...', {
      step: 'drain_pool_init',
    });
    await this.$disconnect();
    await this.pool.end();
    this.logger.info('Prisma connection pool drained successfully.', {
      step: 'drain_pool_success',
    });
  }
}

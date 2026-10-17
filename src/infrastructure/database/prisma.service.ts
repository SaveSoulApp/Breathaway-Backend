import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool, PoolConfig } from 'pg';

import { ContextualLogger, LoggerService } from '@core/logger';

import { DatabasePoolStatus } from './interfaces';

/**
 * Type-safe log event levels matching Prisma.LogLevel.
 */
export type PrismaLogEventType = Extract<
  Prisma.LogLevel,
  'query' | 'error' | 'warn'
>;

const EVENT_QUERY = 'query' as const;
const EVENT_ERROR = 'error' as const;
const EVENT_WARN = 'warn' as const;

/**
 * Service managing the database connection, connection pool observability,
 * and Prisma client query lifecycle.
 *
 * Configures the underlying Node-Postgres connection pool (`pg.Pool`) with bounded
 * limits and acquisition timeouts tailored for stateless GCP Cloud Run autoscaling.
 * Monitors connection saturation, pool lifecycle events, and query performance.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, PrismaLogEventType>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger: ContextualLogger;
  private readonly configService: ConfigService;
  private readonly maxConnections: number;
  private defaultSlowQueryThresholdMs: number;
  private readonly logAllQueries: boolean;

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

    // Query performance thresholds
    const slowQueryThreshold = Number(
      configService.get<number>('DB_SLOW_QUERY_THRESHOLD_MS', 200),
    );
    const logAllQueriesConfig = configService.get<string | boolean>(
      'DB_LOG_ALL_QUERIES',
      false,
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
    super({
      adapter: new PrismaPg(pool),
      log: [
        { emit: 'event', level: EVENT_QUERY },
        { emit: 'event', level: EVENT_ERROR },
        { emit: 'event', level: EVENT_WARN },
      ],
    });

    this.pool = pool;
    this.configService = configService;
    this.maxConnections = poolConfig.max ?? 4;
    this.defaultSlowQueryThresholdMs =
      Number.isFinite(slowQueryThreshold) && slowQueryThreshold > 0
        ? slowQueryThreshold
        : 200;
    this.logAllQueries =
      logAllQueriesConfig === true || logAllQueriesConfig === 'true';

    this.logger = loggerService.forContext('PrismaService');

    this.registerPoolEventListeners();
    this.registerPrismaEventListeners();

    this.logger.info('Initialized bounded PostgreSQL connection pool', {
      step: 'init_pool',
      max: poolConfig.max,
      min: poolConfig.min,
      connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
      idleTimeoutMillis: poolConfig.idleTimeoutMillis,
      statement_timeout: poolConfig.statement_timeout,
      slowQueryThresholdMs: this.slowQueryThresholdMs,
      logAllQueries: this.logAllQueries,
    });
  }

  /**
   * Retrieves the active slow query threshold in milliseconds.
   * Dynamically inspects ConfigService for live configuration changes,
   * falling back to the configured default.
   */
  get slowQueryThresholdMs(): number {
    const dynamicConfig = Number(
      this.configService.get<number>(
        'DB_SLOW_QUERY_THRESHOLD_MS',
        this.defaultSlowQueryThresholdMs,
      ),
    );
    return Number.isFinite(dynamicConfig) && dynamicConfig > 0
      ? dynamicConfig
      : this.defaultSlowQueryThresholdMs;
  }

  /**
   * Allows runtime dynamic adjustment of the slow query threshold
   * (e.g. during database maintenance or performance diagnostics).
   */
  setSlowQueryThresholdMs(thresholdMs: number): void {
    if (Number.isFinite(thresholdMs) && thresholdMs > 0) {
      this.defaultSlowQueryThresholdMs = thresholdMs;
      this.logger.info('Updated dynamic slow query threshold', {
        step: 'update_slow_query_threshold',
        newThresholdMs: thresholdMs,
      });
    }
  }

  /**
   * Retrieves real-time diagnostic status metrics of the PostgreSQL connection pool.
   *
   * @returns Telemetry metrics including active, idle, waiting counts, and saturation percentage.
   */
  getPoolStatus(): DatabasePoolStatus {
    const totalCount = this.pool.totalCount ?? 0;
    const idleCount = this.pool.idleCount ?? 0;
    const activeCount = Math.max(0, totalCount - idleCount);
    const waitingCount = this.pool.waitingCount ?? 0;
    const max = this.maxConnections;
    const utilizationPercent =
      max > 0 ? Math.round((activeCount / max) * 100) : 0;

    return {
      totalCount,
      idleCount,
      activeCount,
      waitingCount,
      max,
      utilizationPercent,
    };
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

  /**
   * Binds lifecycle and diagnostic event listeners to the underlying `pg.Pool`.
   */
  private registerPoolEventListeners(): void {
    // Prevent unhandled errors from dropping idle clients and crashing Node.js
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

    this.pool.on('connect', () => {
      this.logger.debug('New PostgreSQL client connected to pool', {
        step: 'pool_client_connected',
        pool: this.getPoolStatus(),
      });
    });

    this.pool.on('remove', () => {
      this.logger.debug('PostgreSQL client removed from pool', {
        step: 'pool_client_removed',
        pool: this.getPoolStatus(),
      });
    });

    this.pool.on('acquire', () => {
      if ((this.pool.waitingCount ?? 0) > 0) {
        this.logger.warn('PostgreSQL connection pool contention detected', {
          step: 'pool_contention_detected',
          pool: this.getPoolStatus(),
        });
      }
    });
  }

  /**
   * Registers Prisma Client event listeners for query performance and engine diagnostics.
   *
   * Type safety is enforced via PrismaLogEventType matching the super() constructor configuration.
   */
  private registerPrismaEventListeners(): void {
    this.$on(EVENT_QUERY, (event) => {
      this.handleQueryEvent(event);
    });

    this.$on(EVENT_ERROR, (event) => {
      this.logger.error('Prisma client engine error', {
        step: 'prisma_engine_error',
        message: event.message,
        target: event.target,
      });
    });

    this.$on(EVENT_WARN, (event) => {
      this.logger.warn('Prisma client engine warning', {
        step: 'prisma_engine_warn',
        message: event.message,
        target: event.target,
      });
    });
  }

  /**
   * Analyzes executed query telemetry and emits structured warning or debug logs.
   *
   * SECURITY NOTICE: `event.params` is deliberately excluded to prevent logging
   * sensitive data (passwords, tokens, PII). Only parameterized SQL query templates
   * are logged.
   */
  private handleQueryEvent(event: Prisma.QueryEvent): void {
    const MAX_QUERY_LOG_LENGTH = 2000;
    const safeQuery =
      event.query.length > MAX_QUERY_LOG_LENGTH
        ? `${event.query.slice(0, MAX_QUERY_LOG_LENGTH)}... [TRUNCATED]`
        : event.query;

    if (event.duration >= this.slowQueryThresholdMs) {
      this.logger.warn('Prisma detected slow database query', {
        step: 'slow_query_detected',
        query: safeQuery,
        durationMs: event.duration,
        target: event.target,
        pool: this.getPoolStatus(),
      });
    } else if (this.logAllQueries) {
      this.logger.debug('Prisma query executed', {
        step: 'db_query_executed',
        query: safeQuery,
        durationMs: event.duration,
        target: event.target,
      });
    }
  }
}

import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

jest.mock('pg', () => {
  const actualPg = jest.requireActual('pg');
  const mPool = {
    on: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return {
    ...actualPg,
    Pool: jest.fn(() => mPool),
  };
});

describe('PrismaService', () => {
  let configService: jest.Mocked<ConfigService>;
  let loggerService: jest.Mocked<LoggerService>;
  let contextualLoggerMock: {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };
  let onSpy: jest.SpyInstance;
  let registeredPrismaListeners: Record<string, (event: unknown) => void>;

  beforeEach(() => {
    jest.clearAllMocks();

    registeredPrismaListeners = {};
    onSpy = jest
      .spyOn(PrismaClient.prototype, '$on')

      .mockImplementation(((event: string, callback: any) => {
        registeredPrismaListeners[event] = callback;
        return undefined as any;
      }) as any);

    contextualLoggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    loggerService = {
      forContext: jest.fn().mockReturnValue(contextualLoggerMock),
    } as unknown as jest.Mocked<LoggerService>;

    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://user:password@localhost:5432/mydb?schema=public';
        }
        throw new Error(`Missing ${key}`);
      }),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    onSpy.mockRestore();
  });

  it('should initialize pg.Pool with safe serverless defaults when env vars are omitted', () => {
    configService.get.mockReturnValue(undefined);

    new PrismaService(configService, loggerService);

    expect(Pool).toHaveBeenCalledWith({
      connectionString:
        'postgresql://user:password@localhost:5432/mydb?schema=public',
      max: 4,
      min: 0,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    expect(contextualLoggerMock.info).toHaveBeenCalledWith(
      'Initialized bounded PostgreSQL connection pool',
      expect.objectContaining({
        max: 4,
        min: 0,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        statement_timeout: 15000,
        slowQueryThresholdMs: 200,
        logAllQueries: false,
      }),
    );
  });

  it('should initialize pg.Pool with configured environment variables', () => {
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'DB_POOL_MAX':
          return 8;
        case 'DB_POOL_MIN':
          return 1;
        case 'DB_POOL_ACQUISITION_TIMEOUT_MS':
          return 3000;
        case 'DB_POOL_IDLE_TIMEOUT_MS':
          return 5000;
        case 'DB_POOL_STATEMENT_TIMEOUT_MS':
          return 8000;
        case 'DB_SLOW_QUERY_THRESHOLD_MS':
          return 150;
        case 'DB_LOG_ALL_QUERIES':
          return true;
        default:
          return undefined;
      }
    });

    new PrismaService(configService, loggerService);

    expect(Pool).toHaveBeenCalledWith({
      connectionString:
        'postgresql://user:password@localhost:5432/mydb?schema=public',
      max: 8,
      min: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 5000,
      statement_timeout: 8000,
    });
    expect(contextualLoggerMock.info).toHaveBeenCalledWith(
      'Initialized bounded PostgreSQL connection pool',
      expect.objectContaining({
        max: 8,
        min: 1,
        slowQueryThresholdMs: 150,
        logAllQueries: true,
      }),
    );
  });

  describe('Connection Pool Telemetry (getPoolStatus)', () => {
    it('should compute status metrics accurately for an idle pool', () => {
      configService.get.mockReturnValue(undefined);
      const service = new PrismaService(configService, loggerService);
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;

      poolInstance.totalCount = 4;
      poolInstance.idleCount = 4;
      poolInstance.waitingCount = 0;

      const status = service.getPoolStatus();

      expect(status).toEqual({
        totalCount: 4,
        idleCount: 4,
        activeCount: 0,
        waitingCount: 0,
        max: 4,
        utilizationPercent: 0,
      });
    });

    it('should compute status metrics accurately for a loaded pool', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DB_POOL_MAX') return 10;
        return undefined;
      });
      const service = new PrismaService(configService, loggerService);
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;

      poolInstance.totalCount = 10;
      poolInstance.idleCount = 2;
      poolInstance.waitingCount = 3;

      const status = service.getPoolStatus();

      expect(status).toEqual({
        totalCount: 10,
        idleCount: 2,
        activeCount: 8,
        waitingCount: 3,
        max: 10,
        utilizationPercent: 80,
      });
    });
  });

  describe('Pool Lifecycle & Saturation Event Listeners', () => {
    it('should log debug when a new client connects to pool', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      const connectHandler = poolInstance.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'connect',
      )[1];

      poolInstance.totalCount = 1;
      poolInstance.idleCount = 1;
      poolInstance.waitingCount = 0;

      connectHandler();

      expect(contextualLoggerMock.debug).toHaveBeenCalledWith(
        'New PostgreSQL client connected to pool',
        expect.objectContaining({
          step: 'pool_client_connected',
          pool: expect.objectContaining({
            totalCount: 1,
            idleCount: 1,
          }),
        }),
      );
    });

    it('should log debug when a client is removed from pool', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      const removeHandler = poolInstance.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'remove',
      )[1];

      removeHandler();

      expect(contextualLoggerMock.debug).toHaveBeenCalledWith(
        'PostgreSQL client removed from pool',
        expect.objectContaining({
          step: 'pool_client_removed',
          pool: expect.any(Object),
        }),
      );
    });

    it('should log warning on acquire when connection contention is detected', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      const acquireHandler = poolInstance.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'acquire',
      )[1];

      // Case 1: No contention (waitingCount = 0)
      poolInstance.waitingCount = 0;
      acquireHandler();
      expect(contextualLoggerMock.warn).not.toHaveBeenCalled();

      // Case 2: Contention detected (waitingCount = 2)
      poolInstance.waitingCount = 2;
      acquireHandler();
      expect(contextualLoggerMock.warn).toHaveBeenCalledWith(
        'PostgreSQL connection pool contention detected',
        expect.objectContaining({
          step: 'pool_contention_detected',
          pool: expect.objectContaining({
            waitingCount: 2,
          }),
        }),
      );
    });

    it('should bind an error handler to the pool to prevent unhandled process crashes', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      const errorHandler = poolInstance.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'error',
      )[1];

      const testError = new Error('Connection terminated unexpectedly');
      errorHandler(testError);

      expect(contextualLoggerMock.error).toHaveBeenCalledWith(
        'Unexpected error on idle PostgreSQL connection pool client',
        expect.objectContaining({
          step: 'idle_client_error',
          error: 'Connection terminated unexpectedly',
        }),
      );
    });
  });

  describe('Prisma Query Performance Telemetry & Privacy', () => {
    it('should log warning for queries exceeding the slow query threshold with PII parameter redaction', () => {
      configService.get.mockReturnValue(undefined); // slowQueryThreshold = 200
      new PrismaService(configService, loggerService);

      const queryHandler = registeredPrismaListeners['query'];
      expect(queryHandler).toBeDefined();

      const slowQueryEvent: Prisma.QueryEvent = {
        timestamp: new Date(),
        query: 'SELECT * FROM "User" WHERE "email" = $1',
        params: '["sensitive-user@breathaway.app"]',
        duration: 350,
        target: 'public',
      };

      queryHandler(slowQueryEvent);

      expect(contextualLoggerMock.warn).toHaveBeenCalledWith(
        'Prisma detected slow database query',
        expect.objectContaining({
          step: 'slow_query_detected',
          query: 'SELECT * FROM "User" WHERE "email" = $1',
          durationMs: 350,
          target: 'public',
          pool: expect.any(Object),
        }),
      );

      // Verify STRICT PII REDACTION: params must NEVER be in log metadata
      const warnArgs = contextualLoggerMock.warn.mock.calls[0][1];
      expect(warnArgs).not.toHaveProperty('params');
      expect(JSON.stringify(warnArgs)).not.toContain(
        'sensitive-user@breathaway.app',
      );
    });

    it('should truncate excessively long queries exceeding 2000 characters in slow query logs', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const queryHandler = registeredPrismaListeners['query'];
      const longQueryText =
        'SELECT * FROM "User" WHERE ' + 'id = 1 AND '.repeat(300);
      expect(longQueryText.length).toBeGreaterThan(2000);

      const slowQueryEvent: Prisma.QueryEvent = {
        timestamp: new Date(),
        query: longQueryText,
        params: '[]',
        duration: 400,
        target: 'public',
      };

      queryHandler(slowQueryEvent);

      expect(contextualLoggerMock.warn).toHaveBeenCalledWith(
        'Prisma detected slow database query',
        expect.objectContaining({
          step: 'slow_query_detected',
          query: expect.stringMatching(/\.\.\. \[TRUNCATED\]$/),
        }),
      );

      const loggedQuery = contextualLoggerMock.warn.mock.calls[0][1]
        .query as string;
      expect(loggedQuery.length).toBe(2000 + '... [TRUNCATED]'.length);
    });

    it('should not log fast queries when logAllQueries is false', () => {
      configService.get.mockReturnValue(undefined); // logAllQueries = false
      new PrismaService(configService, loggerService);

      const queryHandler = registeredPrismaListeners['query'];

      const fastQueryEvent: Prisma.QueryEvent = {
        timestamp: new Date(),
        query: 'SELECT 1',
        params: '[]',
        duration: 15,
        target: 'public',
      };

      queryHandler(fastQueryEvent);

      expect(contextualLoggerMock.warn).not.toHaveBeenCalled();
      expect(contextualLoggerMock.debug).not.toHaveBeenCalled();
    });

    it('should log fast queries at debug level when logAllQueries is true', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DB_LOG_ALL_QUERIES') return true;
        return undefined;
      });
      new PrismaService(configService, loggerService);

      const queryHandler = registeredPrismaListeners['query'];

      const fastQueryEvent: Prisma.QueryEvent = {
        timestamp: new Date(),
        query: 'SELECT 1',
        params: '[]',
        duration: 15,
        target: 'public',
      };

      queryHandler(fastQueryEvent);

      expect(contextualLoggerMock.warn).not.toHaveBeenCalled();
      expect(contextualLoggerMock.debug).toHaveBeenCalledWith(
        'Prisma query executed',
        expect.objectContaining({
          step: 'db_query_executed',
          query: 'SELECT 1',
          durationMs: 15,
          target: 'public',
        }),
      );
    });

    it('should support dynamic threshold adjustments at runtime via setSlowQueryThresholdMs', () => {
      configService.get.mockReturnValue(undefined); // default 200ms
      const service = new PrismaService(configService, loggerService);

      expect(service.slowQueryThresholdMs).toBe(200);

      // Dynamically raise threshold to 500ms
      service.setSlowQueryThresholdMs(500);
      expect(service.slowQueryThresholdMs).toBe(500);

      expect(contextualLoggerMock.info).toHaveBeenCalledWith(
        'Updated dynamic slow query threshold',
        expect.objectContaining({
          step: 'update_slow_query_threshold',
          newThresholdMs: 500,
        }),
      );

      const queryHandler = registeredPrismaListeners['query'];

      // Query with 350ms duration was slow under 200ms, but should NOT be flagged under 500ms threshold
      const queryEvent: Prisma.QueryEvent = {
        timestamp: new Date(),
        query: 'SELECT * FROM "User"',
        params: '[]',
        duration: 350,
        target: 'public',
      };

      queryHandler(queryEvent);

      expect(contextualLoggerMock.warn).not.toHaveBeenCalledWith(
        'Prisma detected slow database query',
        expect.anything(),
      );
    });

    it('should log Prisma engine error events', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const errorHandler = registeredPrismaListeners['error'];
      expect(errorHandler).toBeDefined();

      const errorEvent: Prisma.LogEvent = {
        timestamp: new Date(),
        message: 'Engine connection lost',
        target: 'quaint::connector::tokio_postgres',
      };

      errorHandler(errorEvent);

      expect(contextualLoggerMock.error).toHaveBeenCalledWith(
        'Prisma client engine error',
        expect.objectContaining({
          step: 'prisma_engine_error',
          message: 'Engine connection lost',
          target: 'quaint::connector::tokio_postgres',
        }),
      );
    });

    it('should log Prisma engine warning events', () => {
      configService.get.mockReturnValue(undefined);
      new PrismaService(configService, loggerService);

      const warnHandler = registeredPrismaListeners['warn'];
      expect(warnHandler).toBeDefined();

      const warnEvent: Prisma.LogEvent = {
        timestamp: new Date(),
        message: 'Engine connection pool exhausted',
        target: 'quaint::connector::tokio_postgres',
      };

      warnHandler(warnEvent);

      expect(contextualLoggerMock.warn).toHaveBeenCalledWith(
        'Prisma client engine warning',
        expect.objectContaining({
          step: 'prisma_engine_warn',
          message: 'Engine connection pool exhausted',
          target: 'quaint::connector::tokio_postgres',
        }),
      );
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should connect on onModuleInit', async () => {
      configService.get.mockReturnValue(undefined);

      const service = new PrismaService(configService, loggerService);
      const connectSpy = jest
        .spyOn(service, '$connect')
        .mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should disconnect and drain pool on onModuleDestroy', async () => {
      configService.get.mockReturnValue(undefined);

      const service = new PrismaService(configService, loggerService);
      const disconnectSpy = jest
        .spyOn(service, '$disconnect')
        .mockResolvedValue(undefined);
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(poolInstance.end).toHaveBeenCalled();
    });
  });
});

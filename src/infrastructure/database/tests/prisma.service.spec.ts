import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

jest.mock('pg', () => {
  const actualPg = jest.requireActual('pg');
  const mPool = {
    on: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
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

  beforeEach(() => {
    jest.clearAllMocks();

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
  });

  it('should bind an error handler to the pool to prevent unhandled process crashes', () => {
    configService.get.mockReturnValue(undefined);

    new PrismaService(configService, loggerService);

    const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
    expect(poolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));

    // Simulate idle client error
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

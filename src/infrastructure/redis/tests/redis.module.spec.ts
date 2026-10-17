import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';

import * as cleanupUtils from '@common/utils/cleanup.utils';
import { LoggerService } from '@core/logger';

import { REDIS_CLIENT } from '../redis.constants';
import { RedisModule } from '../redis.module';
import { redisProvider } from '../redis.provider';

jest.mock('ioredis');

describe('RedisModule & redisProvider', () => {
  let mockConfigService: { get: jest.Mock };
  let mockLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let mockLoggerService: { forContext: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockLogger),
    };
  });

  describe('redisProvider factory', () => {
    it('returns null and logs warning when REDIS_URL is not defined', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const factory = (redisProvider as any).useFactory;
      const result = factory(
        mockConfigService as unknown as ConfigService,
        mockLoggerService as unknown as LoggerService,
      );

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'REDIS_URL environment variable is not defined',
        ),
      );
    });

    it('returns Redis instance when REDIS_URL is defined', () => {
      mockConfigService.get.mockReturnValue('redis://localhost:6379');

      const mockRedisInstance = {
        on: jest.fn(),
      };
      (Redis as unknown as jest.Mock).mockImplementation(
        () => mockRedisInstance,
      );

      const factory = (redisProvider as any).useFactory;
      const result = factory(
        mockConfigService as unknown as ConfigService,
        mockLoggerService as unknown as LoggerService,
      );

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
      });
      expect(mockRedisInstance.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
      expect(result).toBe(mockRedisInstance);
    });
  });

  describe('RedisModule lifecycle', () => {
    it('closes redis client on application shutdown when client is present', async () => {
      const safeCloseSpy = jest
        .spyOn(cleanupUtils, 'safeCloseClient')
        .mockResolvedValue(undefined);

      const mockClient = { quit: jest.fn() } as unknown as Redis;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisModule,
          { provide: REDIS_CLIENT, useValue: mockClient },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const redisModule = module.get<RedisModule>(RedisModule);
      await redisModule.onApplicationShutdown('SIGTERM');

      expect(safeCloseSpy).toHaveBeenCalledWith(
        mockClient,
        mockLogger,
        'Redis',
        'quit',
      );
    });

    it('handles shutdown safely when redis client is null', async () => {
      const safeCloseSpy = jest
        .spyOn(cleanupUtils, 'safeCloseClient')
        .mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisModule,
          { provide: REDIS_CLIENT, useValue: null },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const redisModule = module.get<RedisModule>(RedisModule);
      await expect(
        redisModule.onApplicationShutdown('SIGTERM'),
      ).resolves.not.toThrow();

      expect(safeCloseSpy).not.toHaveBeenCalled();
    });
  });
});

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';

import { LoggerService } from '@core/logger';

import { REDIS_CLIENT } from '../redis.constants';
import { ThrottlerStorageRedisService } from '../throttler-storage-redis.service';

describe('ThrottlerStorageRedisService', () => {
  let service: ThrottlerStorageRedisService;
  let mockRedisClient: {
    eval: jest.Mock;
  } | null;
  let mockLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let mockLoggerService: { forContext: jest.Mock };

  const createService = async (
    client: any,
    isThrottlingEnabledViaRedis: boolean = true,
  ) => {
    mockRedisClient = client;

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockLogger),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (
          key === 'IS_THROTTLING_ENABLED_VIA_REDIS' ||
          key === 'isThrottlingEnabledViaRedis' ||
          key === 'THROTTLING_REDIS_ENABLED'
        ) {
          return isThrottlingEnabledViaRedis;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThrottlerStorageRedisService,
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ThrottlerStorageRedisService>(
      ThrottlerStorageRedisService,
    );
  };

  afterEach(() => {
    service?.onApplicationShutdown();
    jest.clearAllMocks();
  });

  describe('When Redis is configured and isThrottlingEnabledViaRedis is true', () => {
    beforeEach(async () => {
      await createService(
        {
          eval: jest.fn(),
        },
        true,
      );
    });

    it('should be defined and report isRedisThrottlingActive true', () => {
      expect(service).toBeDefined();
      expect(service.isRedisThrottlingActive).toBe(true);
    });

    it('should execute Redis Lua script and return formatted record under rate limit', async () => {
      // Lua script returns [totalHits, timeToExpire, isBlocked (0 or 1), timeToBlockExpire]
      mockRedisClient!.eval.mockResolvedValue([1, 10, 0, 0]);

      const result = await service.increment('test-ip', 10000, 5, 0, 'short');

      expect(mockRedisClient!.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        'throttle:test-ip:short:hits',
        'throttle:test-ip:short:blocked',
        10000,
        5,
        0,
      );

      expect(result).toEqual({
        totalHits: 1,
        timeToExpire: 10,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('should return isBlocked true when hit limit is exceeded', async () => {
      mockRedisClient!.eval.mockResolvedValue([6, 8, 1, 8]);

      const result = await service.increment('test-ip', 10000, 5, 0, 'short');

      expect(result).toEqual({
        totalHits: 6,
        timeToExpire: 8,
        isBlocked: true,
        timeToBlockExpire: 8,
      });
    });

    it('should return isBlocked true with block duration when blockDuration is specified', async () => {
      mockRedisClient!.eval.mockResolvedValue([6, 8, 1, 60]);

      const result = await service.increment(
        'test-ip',
        10000,
        5,
        60000,
        'short',
      );

      expect(result).toEqual({
        totalHits: 6,
        timeToExpire: 8,
        isBlocked: true,
        timeToBlockExpire: 60,
      });
    });

    it('should gracefully fall back to in-memory store when Redis eval throws error', async () => {
      mockRedisClient!.eval.mockRejectedValue(
        new Error('Redis connection timeout'),
      );

      const result = await service.increment('test-ip', 10000, 5, 0, 'short');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis throttler increment failed; falling back to in-memory store',
        expect.objectContaining({
          key: 'test-ip',
          throttlerName: 'short',
          step: 'redis_throttler_fallback',
        }),
      );

      // In-memory fallback handles the increment successfully
      expect(result).toBeDefined();
      expect(result.totalHits).toBe(1);
      expect(result.isBlocked).toBe(false);
    });
  });

  describe('When isThrottlingEnabledViaRedis is false', () => {
    beforeEach(async () => {
      await createService(
        {
          eval: jest.fn(),
        },
        false,
      );
    });

    it('should bypass Redis completely and use in-memory store even if Redis client exists', async () => {
      expect(service.isRedisThrottlingActive).toBe(false);

      const result1 = await service.increment(
        'bypass-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result1.totalHits).toBe(1);
      expect(mockRedisClient!.eval).not.toHaveBeenCalled();

      const result2 = await service.increment(
        'bypass-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result2.totalHits).toBe(2);
      expect(mockRedisClient!.eval).not.toHaveBeenCalled();

      const result3 = await service.increment(
        'bypass-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result3.totalHits).toBe(3);
      expect(result3.isBlocked).toBe(true);
      expect(mockRedisClient!.eval).not.toHaveBeenCalled();
    });
  });

  describe('When Redis is unconfigured (null)', () => {
    beforeEach(async () => {
      await createService(null, true);
    });

    it('should report isRedisThrottlingActive false and fall back to in-memory store', async () => {
      expect(service.isRedisThrottlingActive).toBe(false);

      const result1 = await service.increment(
        'fallback-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result1.totalHits).toBe(1);
      expect(result1.isBlocked).toBe(false);

      const result2 = await service.increment(
        'fallback-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result2.totalHits).toBe(2);
      expect(result2.isBlocked).toBe(false);

      const result3 = await service.increment(
        'fallback-ip',
        5000,
        2,
        5000,
        'default',
      );
      expect(result3.totalHits).toBe(3);
      expect(result3.isBlocked).toBe(true);
    });

    it('should clean up in-memory timeouts onApplicationShutdown', () => {
      expect(() => service.onApplicationShutdown()).not.toThrow();
    });
  });
});

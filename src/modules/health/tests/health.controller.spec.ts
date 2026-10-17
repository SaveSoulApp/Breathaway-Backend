import {
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';

import { HealthController } from '../health.controller';
import { DatabaseHealthIndicator } from '../indicators/database.health';
import { RedisHealthIndicator } from '../indicators/redis.health';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthCheckService: { check: jest.Mock };
  let mockMemoryHealthIndicator: {
    checkHeap: jest.Mock;
    checkRSS: jest.Mock;
  };
  let mockDatabaseHealthIndicator: { isHealthy: jest.Mock };
  let mockRedisHealthIndicator: { isHealthy: jest.Mock };

  beforeEach(async () => {
    mockHealthCheckService = {
      check: jest.fn(),
    };

    mockMemoryHealthIndicator = {
      checkHeap: jest.fn(),
      checkRSS: jest.fn(),
    };

    mockDatabaseHealthIndicator = {
      isHealthy: jest.fn(),
    };

    mockRedisHealthIndicator = {
      isHealthy: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        {
          provide: MemoryHealthIndicator,
          useValue: mockMemoryHealthIndicator,
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: mockDatabaseHealthIndicator,
        },
        {
          provide: RedisHealthIndicator,
          useValue: mockRedisHealthIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkHealth (Liveness Probe)', () => {
    it('executes memory heap and RSS indicators and returns health result', async () => {
      const mockResult: HealthCheckResult = {
        status: 'ok',
        info: {
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
        },
        error: {},
        details: {
          memory_heap: { status: 'up' },
          memory_rss: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockImplementation(async (indicators) => {
        for (const indicator of indicators) {
          await indicator();
        }
        return mockResult;
      });

      const result = await controller.checkHealth();

      expect(mockHealthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
      ]);
      expect(mockMemoryHealthIndicator.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        1024 * 1024 * 1024,
      );
      expect(mockMemoryHealthIndicator.checkRSS).toHaveBeenCalledWith(
        'memory_rss',
        1536 * 1024 * 1024,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('checkReady (Readiness Probe)', () => {
    it('executes database and redis indicators and returns readiness result', async () => {
      const mockResult: HealthCheckResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockImplementation(async (indicators) => {
        for (const indicator of indicators) {
          await indicator();
        }
        return mockResult;
      });

      const result = await controller.checkReady();

      expect(mockHealthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
      ]);
      expect(mockDatabaseHealthIndicator.isHealthy).toHaveBeenCalledWith(
        'database',
      );
      expect(mockRedisHealthIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(result).toEqual(mockResult);
    });

    it('propagates error when readiness indicators fail', async () => {
      const checkError = new Error('Service Unavailable');
      mockHealthCheckService.check.mockRejectedValue(checkError);

      await expect(controller.checkReady()).rejects.toThrow(checkError);
    });
  });
});

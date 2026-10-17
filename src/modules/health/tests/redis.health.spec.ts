import { HealthIndicatorService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { RedisService } from '@infrastructure/redis';

import { RedisHealthIndicator } from '../indicators/redis.health';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let mockRedisService: { isConfigured: boolean; ping: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };

  const createIndicator = async (isConfigured: boolean) => {
    mockRedisService = {
      isConfigured,
      ping: jest.fn(),
    };
    healthIndicatorService = {
      check: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: HealthIndicatorService,
          useValue: healthIndicatorService,
        },
      ],
    }).compile();

    return module.get<RedisHealthIndicator>(RedisHealthIndicator);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return up status with enabled: false when redis is not configured', async () => {
    indicator = await createIndicator(false);

    const mockDisabledResult = {
      redis: {
        status: 'up',
        enabled: false,
        message: 'Redis is not configured',
      },
    };
    healthIndicatorService.check.mockReturnValue({
      up: jest.fn().mockReturnValue(mockDisabledResult),
      down: jest.fn(),
    });

    const result = await indicator.isHealthy('redis');

    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(result).toEqual(mockDisabledResult);
    expect(mockRedisService.ping).not.toHaveBeenCalled();
  });

  it('should return up status when redis ping succeeds', async () => {
    indicator = await createIndicator(true);
    mockRedisService.ping.mockResolvedValue('PONG');

    const mockUpResult = { redis: { status: 'up' } };
    healthIndicatorService.check.mockReturnValue({
      up: jest.fn().mockReturnValue(mockUpResult),
      down: jest.fn(),
    });

    const result = await indicator.isHealthy('redis');

    expect(mockRedisService.ping).toHaveBeenCalledTimes(1);
    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(result).toEqual(mockUpResult);
  });

  it('should return down status with error message when redis ping throws', async () => {
    indicator = await createIndicator(true);
    const redisError = new Error('Connection refused');
    mockRedisService.ping.mockRejectedValue(redisError);

    const mockDownResult = {
      redis: { status: 'down', message: 'Connection refused' },
    };
    healthIndicatorService.check.mockReturnValue({
      up: jest.fn(),
      down: jest.fn().mockReturnValue(mockDownResult),
    });

    const result = await indicator.isHealthy('redis');

    expect(mockRedisService.ping).toHaveBeenCalledTimes(1);
    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(result).toEqual(mockDownResult);
  });
});

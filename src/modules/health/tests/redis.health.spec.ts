import { HealthIndicatorService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { RedisHealthIndicator } from '../indicators/redis.health';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let redisClient: { ping: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };

  beforeEach(async () => {
    redisClient = {
      ping: jest.fn(),
    };

    healthIndicatorService = {
      check: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        { provide: 'REDIS_CLIENT', useValue: redisClient },
        {
          provide: HealthIndicatorService,
          useValue: healthIndicatorService,
        },
      ],
    }).compile();

    indicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return up status when redis ping succeeds', async () => {
    // Arrange
    redisClient.ping.mockResolvedValue('PONG');
    const mockUpResult = { redis: { status: 'up' } };
    healthIndicatorService.check.mockReturnValue({
      up: jest.fn().mockReturnValue(mockUpResult),
      down: jest.fn(),
    });

    // Act
    const result = await indicator.isHealthy('redis');

    // Assert
    expect(redisClient.ping).toHaveBeenCalledTimes(1);
    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(result).toEqual(mockUpResult);
  });

  it('should return down status with error message when redis ping throws', async () => {
    // Arrange
    const redisError = new Error('Connection refused');
    redisClient.ping.mockRejectedValue(redisError);
    const mockDownResult = {
      redis: { status: 'down', message: 'Connection refused' },
    };
    healthIndicatorService.check.mockReturnValue({
      up: jest.fn(),
      down: jest.fn().mockReturnValue(mockDownResult),
    });

    // Act
    const result = await indicator.isHealthy('redis');

    // Assert
    expect(redisClient.ping).toHaveBeenCalledTimes(1);
    expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
    expect(result).toEqual(mockDownResult);
  });
});

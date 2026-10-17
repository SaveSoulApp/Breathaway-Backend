import { HealthIndicatorService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@infrastructure/database/prisma.service';

import { DatabaseHealthIndicator } from '../indicators/database.health';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let mockPrisma: { $queryRaw: jest.Mock };
  let mockHealthIndicatorService: { check: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn(),
    };

    mockHealthIndicatorService = {
      check: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: HealthIndicatorService,
          useValue: mockHealthIndicatorService,
        },
      ],
    }).compile();

    indicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return up status when prisma $queryRaw succeeds', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    const mockUpResult = { database: { status: 'up' } };
    mockHealthIndicatorService.check.mockReturnValue({
      up: jest.fn().mockReturnValue(mockUpResult),
      down: jest.fn(),
    });

    const result = await indicator.isHealthy('database');

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockHealthIndicatorService.check).toHaveBeenCalledWith('database');
    expect(result).toEqual(mockUpResult);
  });

  it('should return down status with error message when prisma $queryRaw fails', async () => {
    const dbError = new Error('Connection pool exhausted');
    mockPrisma.$queryRaw.mockRejectedValue(dbError);
    const mockDownResult = {
      database: { status: 'down', message: 'Connection pool exhausted' },
    };
    mockHealthIndicatorService.check.mockReturnValue({
      up: jest.fn(),
      down: jest.fn().mockReturnValue(mockDownResult),
    });

    const result = await indicator.isHealthy('database');

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockHealthIndicatorService.check).toHaveBeenCalledWith('database');
    expect(result).toEqual(mockDownResult);
  });
});

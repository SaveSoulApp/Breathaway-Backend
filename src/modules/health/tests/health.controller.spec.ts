import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
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
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('checkHealth', () => {
    it('should return liveness ok status', () => {
      const result = controller.checkHealth();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('checkReady', () => {
    it('should return readiness ok status when db is reachable', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const result = await controller.checkReady();

      expect(prismaService.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual({ status: 'ok', db: 'connected' });
    });

    it('should throw ServiceUnavailableException when db query fails', async () => {
      prismaService.$queryRaw.mockRejectedValue(
        new Error('DB connection failed'),
      );

      await expect(controller.checkReady()).rejects.toThrow(
        new ServiceUnavailableException('Database is unreachable'),
      );
    });
  });
});

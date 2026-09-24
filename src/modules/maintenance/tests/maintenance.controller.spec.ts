import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { GcpOidcAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';

import { MaintenanceController } from '../maintenance.controller';
import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: jest.Mocked<MaintenanceService>;

  beforeEach(async () => {
    const mockMaintenanceService = {
      expireCreditBundles: jest.fn(),
      voidPendingLikes: jest.fn(),
      expireSubscriptions: jest.fn(),
      warnExpiringCreditBundles: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MaintenanceService, useValue: mockMaintenanceService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(GcpOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('expireCreditBundles', () => {
    it('should delegate to maintenanceService.expireCreditBundles', async () => {
      // Arrange
      const expectedResult = { batchesPublished: 2, totalUsersEnqueued: 150 };
      service.expireCreditBundles.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.expireCreditBundles();

      // Assert
      expect(service.expireCreditBundles).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('expireLikes', () => {
    it('should delegate to maintenanceService.voidPendingLikes', async () => {
      // Arrange
      const expectedResult = { voidedCount: 42 };
      service.voidPendingLikes.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.expireLikes();

      // Assert
      expect(service.voidPendingLikes).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('expireSubscriptions', () => {
    it('should delegate to maintenanceService.expireSubscriptions', async () => {
      // Arrange
      const expectedResult = { expiredCount: 5 };
      service.expireSubscriptions.mockResolvedValue(expectedResult as never);

      // Act
      const result = await controller.expireSubscriptions();

      // Assert
      expect(service.expireSubscriptions).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('warnExpiringBundles', () => {
    it('should delegate to maintenanceService.warnExpiringCreditBundles', async () => {
      // Arrange
      const expectedResult = { batchesPublished: 1, totalUsersEnqueued: 25 };
      service.warnExpiringCreditBundles.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.warnExpiringBundles();

      // Assert
      expect(service.warnExpiringCreditBundles).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { GcpOidcAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';

import { PaymentsReconciliationService } from '../../payments/payments.reconciliation';
import { MaintenanceController } from '../maintenance.controller';
import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: jest.Mocked<MaintenanceService>;
  let reconciliationService: jest.Mocked<PaymentsReconciliationService>;

  beforeEach(async () => {
    const mockMaintenanceService = {
      expireCreditBundles: jest.fn(),
      expireSubscriptions: jest.fn(),
      warnExpiringCreditBundles: jest.fn(),
    };

    const mockReconciliationService = {
      reconcileStaleOrders: jest.fn(),
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
        {
          provide: PaymentsReconciliationService,
          useValue: mockReconciliationService,
        },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(GcpOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
    reconciliationService = module.get(PaymentsReconciliationService);
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

  describe('reconcilePayments', () => {
    it('should delegate to paymentsReconciliationService.reconcileStaleOrders', async () => {
      // Arrange
      const expectedResult = { total: 3, settled: 2, failed: 0, expired: 1 };
      reconciliationService.reconcileStaleOrders.mockResolvedValue(
        expectedResult,
      );

      // Act
      const result = await controller.reconcilePayments();

      // Assert
      expect(reconciliationService.reconcileStaleOrders).toHaveBeenCalledTimes(
        1,
      );
      expect(result).toEqual(expectedResult);
    });
  });
});

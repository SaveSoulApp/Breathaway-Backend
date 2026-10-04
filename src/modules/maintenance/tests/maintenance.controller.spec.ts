import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { GcpOidcAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';
import { InstagramService } from '@modules/instagram/instagram.service';

import { PaymentsReconciliationService } from '../../payments/payments.reconciliation';
import { MaintenanceController } from '../maintenance.controller';
import { MaintenanceService } from '../maintenance.service';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: jest.Mocked<MaintenanceService>;
  let reconciliationService: jest.Mocked<PaymentsReconciliationService>;
  let instagramService: jest.Mocked<InstagramService>;

  beforeEach(async () => {
    const mockMaintenanceService = {
      expireCreditBundles: jest.fn(),
      expireSubscriptions: jest.fn(),
      warnExpiringCreditBundles: jest.fn(),
      purgeExpiredUserSessions: jest.fn(),
    };

    const mockReconciliationService = {
      reconcileStaleOrders: jest.fn(),
    };

    const mockInstagramService = {
      refreshSystemAccessToken: jest.fn(),
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
        { provide: InstagramService, useValue: mockInstagramService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(GcpOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
    reconciliationService = module.get(PaymentsReconciliationService);
    instagramService = module.get(InstagramService);
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

  describe('rotateInstagramToken', () => {
    it('should trigger instagramService.refreshSystemAccessToken and return sanitized confirmation', async () => {
      // Arrange
      instagramService.refreshSystemAccessToken.mockResolvedValue({
        access_token: 'secret-token-that-must-not-be-leaked',
        expires_in: 5184000,
      });

      // Act
      const result = await controller.rotateInstagramToken();

      // Assert
      expect(instagramService.refreshSystemAccessToken).toHaveBeenCalledTimes(
        1,
      );
      expect(result).toEqual({
        success: true,
        message:
          'Instagram system access token rotated and persisted to Secret Manager successfully',
      });
      expect(result).not.toHaveProperty('access_token');
    });
  });

  describe('purgeExpiredSessions', () => {
    it('should invoke maintenanceService.purgeExpiredUserSessions', async () => {
      // Arrange
      service.purgeExpiredUserSessions.mockResolvedValue({
        deletedCount: 15,
        cutoffDate: '2026-09-27T00:00:00.000Z',
      });

      // Act
      await controller.purgeExpiredSessions();

      // Assert
      expect(service.purgeExpiredUserSessions).toHaveBeenCalledTimes(1);
    });
  });
});

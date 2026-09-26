import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditSource,
  PaymentGateway,
  PaymentOrderStatus,
  Prisma,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { CreditsService } from '@modules/credits/credits.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import {
  PAYMENT_COMPLETED_EVENT,
  PaymentCompletedEvent,
} from '../events/payment-completed.event';
import { RazorpayGateway } from '../gateways/razorpay/razorpay.gateway';
import { PaymentsReconciliationService } from '../payments.reconciliation';

describe('PaymentsReconciliationService', () => {
  let service: PaymentsReconciliationService;
  let prisma: MockPrismaService;
  let creditsServiceMock: jest.Mocked<CreditsService>;
  let transactionsServiceMock: jest.Mocked<TransactionsService>;
  let razorpayGatewayMock: jest.Mocked<RazorpayGateway>;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();

    creditsServiceMock = {
      grantCredits: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CreditsService>;

    transactionsServiceMock = {
      record: jest.fn().mockResolvedValue({ id: 'tx_rec_123' }),
    } as unknown as jest.Mocked<TransactionsService>;

    razorpayGatewayMock = {
      provider: PaymentGateway.RAZORPAY,
      createOrder: jest.fn(),
      fetchOrderStatus: jest.fn(),
      verifySignature: jest.fn(),
      fetchCapturedPaymentId: jest.fn().mockResolvedValue('pay_rzp_rec_456'),
    } as unknown as jest.Mocked<RazorpayGateway>;

    eventEmitterMock = {
      emit: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        event: jest.fn(),
      }),
    };

    const configServiceMock = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'CREDIT_EXPIRY_DAYS') return 90;
          if (key === 'NODE_ENV') return 'development';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        PaymentsReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CreditsService, useValue: creditsServiceMock },
        { provide: TransactionsService, useValue: transactionsServiceMock },
        { provide: RazorpayGateway, useValue: razorpayGatewayMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<PaymentsReconciliationService>(
      PaymentsReconciliationService,
    );

    // Mock $transaction to execute callback
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(prisma);
    });
  });

  describe('reconcileStaleOrders', () => {
    it('should do nothing if no stale orders exist', async () => {
      // Arrange
      (prisma.paymentOrder.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      await service.reconcileStaleOrders();

      // Assert
      expect(razorpayGatewayMock.fetchOrderStatus).not.toHaveBeenCalled();
    });

    it('should expire orders older than 30 minutes', async () => {
      // Arrange
      const now = DateUtil.now();
      const oldCreatedAt = DateUtil.dayjs(now).subtract(35, 'minute').toDate(); // 35 min ago

      const staleOrder = {
        id: 'order_old_1',
        userId: 'user_1',
        planId: 'plan_1',
        gateway: PaymentGateway.RAZORPAY,
        gatewayOrderId: 'order_rzp_old',
        status: PaymentOrderStatus.PENDING,
        createdAt: oldCreatedAt,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findMany as jest.Mock).mockResolvedValue([
        staleOrder,
      ]);
      (prisma.paymentOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      await service.reconcileStaleOrders();

      // Assert
      expect(prisma.paymentOrder.update).toHaveBeenCalledWith({
        where: { id: 'order_old_1', status: PaymentOrderStatus.PENDING },
        data: { status: PaymentOrderStatus.EXPIRED },
      });
      expect(razorpayGatewayMock.fetchOrderStatus).not.toHaveBeenCalled();
    });

    it('should fulfil captured orders between 15 and 30 minutes old', async () => {
      // Arrange
      const now = DateUtil.now();
      const staleCreatedAt = DateUtil.dayjs(now)
        .subtract(20, 'minute')
        .toDate(); // 20 min ago

      const staleOrder = {
        id: 'order_stale_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        gatewayOrderId: 'order_rzp_stale',
        status: PaymentOrderStatus.PENDING,
        createdAt: staleCreatedAt,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findMany as jest.Mock).mockResolvedValue([
        staleOrder,
      ]);
      razorpayGatewayMock.fetchOrderStatus.mockResolvedValue('CAPTURED');
      (prisma.paymentOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      await service.reconcileStaleOrders();

      // Assert
      expect(razorpayGatewayMock.fetchOrderStatus).toHaveBeenCalledWith(
        'order_rzp_stale',
      );
      expect(transactionsServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          gatewayTransactionId: 'pay_rzp_rec_456',
          productId: 'plan_1',
          creditsGranted: 10,
        }),
        prisma,
      );
      expect(creditsServiceMock.grantCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          amount: 10,
          source: CreditSource.PURCHASE,
          referenceId: 'tx_rec_123',
        }),
        prisma,
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        PAYMENT_COMPLETED_EVENT,
        expect.any(PaymentCompletedEvent),
      );
    });

    it('should mark order FAILED when gateway returns FAILED', async () => {
      // Arrange
      const now = DateUtil.now();
      const staleCreatedAt = DateUtil.dayjs(now)
        .subtract(20, 'minute')
        .toDate();

      const staleOrder = {
        id: 'order_failed_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        gatewayOrderId: 'order_rzp_failed',
        status: PaymentOrderStatus.PENDING,
        createdAt: staleCreatedAt,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findMany as jest.Mock).mockResolvedValue([
        staleOrder,
      ]);
      razorpayGatewayMock.fetchOrderStatus.mockResolvedValue('FAILED');
      (prisma.paymentOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      await service.reconcileStaleOrders();

      // Assert
      expect(prisma.paymentOrder.update).toHaveBeenCalledWith({
        where: { id: 'order_failed_1', status: PaymentOrderStatus.PENDING },
        data: { status: PaymentOrderStatus.FAILED },
      });
      expect(transactionsServiceMock.record).not.toHaveBeenCalled();
    });

    it('should handle P2002/P2025 gracefully if order was concurrently processed', async () => {
      // Arrange
      const now = DateUtil.now();
      const staleCreatedAt = DateUtil.dayjs(now)
        .subtract(20, 'minute')
        .toDate();

      const staleOrder = {
        id: 'order_race_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        gatewayOrderId: 'order_rzp_race',
        status: PaymentOrderStatus.PENDING,
        createdAt: staleCreatedAt,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findMany as jest.Mock).mockResolvedValue([
        staleOrder,
      ]);
      razorpayGatewayMock.fetchOrderStatus.mockResolvedValue('CAPTURED');
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Order already updated', {
          code: 'P2025',
          clientVersion: '7.8.0',
        }),
      );

      // Act & Assert — should not throw
      await expect(service.reconcileStaleOrders()).resolves.not.toThrow();
    });
  });
});

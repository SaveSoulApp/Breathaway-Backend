import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { PaymentsService } from '@modules/payments/payments.service';
import { TransactionsService } from '@modules/transactions/transactions.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway, PaymentOrderStatus, Prisma } from '@prisma/client';

import { RazorpayWebhookRequestDto } from '../../dto/request/razorpay-payment-webhook.request.dto';
import { RazorpayPaymentHandler } from '../../handlers/razorpay-payment.handler';

describe('RazorpayPaymentHandler', () => {
  let handler: RazorpayPaymentHandler;
  let prisma: MockPrismaService;
  let transactionsService: jest.Mocked<
    Pick<TransactionsService, 'findByGatewayTransaction'>
  >;
  let paymentsService: jest.Mocked<Pick<PaymentsService, 'fulfil'>>;

  const mockWebhookDto = (
    event: string,
    paymentOverrides: Record<string, unknown> = {},
  ): RazorpayWebhookRequestDto => ({
    event,
    entity: 'event',
    event_id: 'evt_12345',
    payload: {
      payment: {
        entity: {
          id: 'pay_rzp_123',
          entity: 'payment',
          amount: 49900,
          currency: 'INR',
          status: 'captured',
          order_id: 'order_rzp_456',
          ...paymentOverrides,
        },
      },
    },
  });

  beforeEach(async () => {
    prisma = createPrismaMock();

    transactionsService = {
      findByGatewayTransaction: jest.fn().mockResolvedValue(null),
    };

    paymentsService = {
      fulfil: jest.fn().mockResolvedValue(10),
    };

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RazorpayPaymentHandler,
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    handler = module.get(RazorpayPaymentHandler);
  });

  describe('canHandle', () => {
    it('should return true for payment.captured', () => {
      expect(handler.canHandle(mockWebhookDto('payment.captured'))).toBe(true);
    });

    it('should return true for payment.authorized', () => {
      expect(handler.canHandle(mockWebhookDto('payment.authorized'))).toBe(
        true,
      );
    });

    it('should return true for payment.failed', () => {
      expect(handler.canHandle(mockWebhookDto('payment.failed'))).toBe(true);
    });

    it('should return false for unhandled events like refund.created', () => {
      expect(handler.canHandle(mockWebhookDto('refund.created'))).toBe(false);
    });
  });

  describe('handle - failure events', () => {
    it('should mark order FAILED when event is payment.failed', async () => {
      // Arrange
      (prisma.paymentOrder.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      // Act
      await handler.handle(mockWebhookDto('payment.failed'));

      // Assert
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: {
          gatewayOrderId: 'order_rzp_456',
          gateway: PaymentGateway.RAZORPAY,
          status: PaymentOrderStatus.PENDING,
        },
        data: { status: PaymentOrderStatus.FAILED },
      });
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });
  });

  describe('handle - capture events', () => {
    it('should ignore event when payment or order ID is missing', async () => {
      // Arrange
      const dto = {
        event: 'payment.captured',
        entity: 'event',
        payload: {},
      } as RazorpayWebhookRequestDto;

      // Act
      await handler.handle(dto);

      // Assert
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });

    it('should skip processing if payment was already recorded in transactions table', async () => {
      // Arrange
      transactionsService.findByGatewayTransaction.mockResolvedValue({
        id: 'tx_existing',
      } as any);

      // Act
      await handler.handle(mockWebhookDto('payment.captured'));

      // Assert
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });

    it('should do nothing if PaymentOrder is not found', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(null);

      // Act
      await handler.handle(mockWebhookDto('payment.captured'));

      // Assert
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });

    it('should do nothing if PaymentOrder is already PAID', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: 'order_1',
        status: PaymentOrderStatus.PAID,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      });

      // Act
      await handler.handle(mockWebhookDto('payment.captured'));

      // Assert
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });

    it('should call paymentsService.fulfil on valid captured payment', async () => {
      // Arrange
      const mockOrder = {
        id: 'order_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);

      // Act
      await handler.handle(mockWebhookDto('payment.captured'));

      // Assert
      expect(paymentsService.fulfil).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            id: 'order_1',
            userId: 'user_1',
          }),
          gatewayPaymentId: 'pay_rzp_123',
          gatewayOrderId: 'order_rzp_456',
        }),
      );
    });

    it('should catch P2002 error gracefully on concurrent race', async () => {
      // Arrange
      const mockOrder = {
        id: 'order_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      paymentsService.fulfil.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Duplicate key', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      // Act & Assert — should not throw
      await expect(
        handler.handle(mockWebhookDto('payment.captured')),
      ).resolves.not.toThrow();
    });

    it('should rethrow non-duplicate unexpected errors so webhook is retried', async () => {
      // Arrange
      const mockOrder = {
        id: 'order_1',
        userId: 'user_1',
        planId: 'plan_1',
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
      };

      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      paymentsService.fulfil.mockRejectedValue(new Error('Database offline'));

      // Act & Assert
      await expect(
        handler.handle(mockWebhookDto('payment.captured')),
      ).rejects.toThrow('Database offline');
    });
  });
});

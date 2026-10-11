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

import { CashfreeWebhookRequestDto } from '../../dto/request/cashfree-payment-webhook.request.dto';
import { CashfreePaymentHandler } from '../../handlers/cashfree-payment.handler';

describe('CashfreePaymentHandler', () => {
  let handler: CashfreePaymentHandler;
  let prisma: MockPrismaService;
  let transactionsService: jest.Mocked<
    Pick<TransactionsService, 'findByGatewayTransaction' | 'attachRawPayload'>
  >;
  let paymentsService: jest.Mocked<Pick<PaymentsService, 'fulfil'>>;

  const mockWebhookDto = (
    eventType: string,
    overrides: Record<string, unknown> = {},
  ): CashfreeWebhookRequestDto => ({
    type: eventType,
    event_type: eventType,
    event_time: '2026-10-08T12:00:00Z',
    data: {
      order: {
        order_id: 'rcpt_cf_123',
        order_amount: 399.0,
        order_currency: 'INR',
      },
      payment: {
        cf_payment_id: '987654321',
        payment_status: 'SUCCESS',
        payment_amount: 399.0,
        payment_currency: 'INR',
        ...overrides,
      },
    },
  });

  beforeEach(async () => {
    prisma = createPrismaMock();

    transactionsService = {
      findByGatewayTransaction: jest.fn().mockResolvedValue(null),
      attachRawPayload: jest.fn().mockResolvedValue(undefined),
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
        CashfreePaymentHandler,
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    handler = module.get(CashfreePaymentHandler);
  });

  describe('canHandle', () => {
    it('should return true for PAYMENT_SUCCESS_WEBHOOK', () => {
      expect(handler.canHandle(mockWebhookDto('PAYMENT_SUCCESS_WEBHOOK'))).toBe(
        true,
      );
    });

    it('should return true for ORDER_PAID', () => {
      expect(handler.canHandle(mockWebhookDto('ORDER_PAID'))).toBe(true);
    });

    it('should return true for PAYMENT_FAILED_WEBHOOK', () => {
      expect(handler.canHandle(mockWebhookDto('PAYMENT_FAILED_WEBHOOK'))).toBe(
        true,
      );
    });

    it('should return true for PAYMENT_USER_DROPPED_WEBHOOK', () => {
      expect(
        handler.canHandle(mockWebhookDto('PAYMENT_USER_DROPPED_WEBHOOK')),
      ).toBe(true);
    });

    it('should return true when only type is present (without event_type)', () => {
      const dto: CashfreeWebhookRequestDto = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      };
      expect(handler.canHandle(dto)).toBe(true);
    });

    it('should return false for unhandled events like REFUND_SUCCESS', () => {
      expect(handler.canHandle(mockWebhookDto('REFUND_SUCCESS'))).toBe(false);
    });
  });

  describe('handle - failure events', () => {
    it('should mark the PaymentOrder as FAILED on PAYMENT_FAILED_WEBHOOK', async () => {
      const dto = mockWebhookDto('PAYMENT_FAILED_WEBHOOK');

      await handler.handle(dto);

      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: {
          gatewayOrderId: 'rcpt_cf_123',
          gateway: PaymentGateway.CASHFREE,
          status: PaymentOrderStatus.PENDING,
        },
        data: { status: PaymentOrderStatus.FAILED },
      });
      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });
  });

  describe('handle - capture events', () => {
    it('should skip fulfillment if payment was already processed (idempotency check)', async () => {
      transactionsService.findByGatewayTransaction.mockResolvedValueOnce({
        id: 'tx_existing_123',
        rawPayload: { event_type: 'PAYMENT_SUCCESS_WEBHOOK' },
      } as any);

      const dto = mockWebhookDto('PAYMENT_SUCCESS_WEBHOOK');
      await handler.handle(dto);

      expect(paymentsService.fulfil).not.toHaveBeenCalled();
    });

    it('should fulfill order and grant credits on valid PAYMENT_SUCCESS_WEBHOOK', async () => {
      const mockOrder = {
        id: 'order_ulid_123',
        userId: 'user_ulid_456',
        planId: 'plan_1',
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
        amount: 39900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.CASHFREE,
        status: PaymentOrderStatus.PENDING,
      };

      prisma.paymentOrder.findFirst.mockResolvedValueOnce(mockOrder as any);

      const dto = mockWebhookDto('PAYMENT_SUCCESS_WEBHOOK');
      await handler.handle(dto);

      expect(paymentsService.fulfil).toHaveBeenCalledWith({
        order: {
          id: mockOrder.id,
          userId: mockOrder.userId,
          planId: mockOrder.planId,
          plan: mockOrder.plan,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          countryCode: mockOrder.countryCode,
          gateway: mockOrder.gateway,
        },
        gatewayPaymentId: '987654321',
        gatewayOrderId: 'rcpt_cf_123',
        ctx: expect.any(Object),
        rawPayload: dto,
      });
    });

    it('should handle P2002 duplicate error gracefully without propagating', async () => {
      const mockOrder = {
        id: 'order_ulid_123',
        userId: 'user_ulid_456',
        planId: 'plan_1',
        plan: { id: 'plan_1', creditsGranted: 10, validityDays: 30 },
        amount: 39900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.CASHFREE,
        status: PaymentOrderStatus.PENDING,
      };

      prisma.paymentOrder.findFirst.mockResolvedValueOnce(mockOrder as any);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      paymentsService.fulfil.mockRejectedValueOnce(p2002Error);

      const dto = mockWebhookDto('PAYMENT_SUCCESS_WEBHOOK');

      await expect(handler.handle(dto)).resolves.not.toThrow();
    });
  });
});

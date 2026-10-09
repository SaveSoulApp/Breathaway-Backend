import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';

import { GatewayOrderCreationException } from '../application/exceptions';
import { GatewayOrderStatus } from '../gateways/payment-gateway.interface';
import { CashfreeGateway } from '../gateways/cashfree/cashfree.gateway';

describe('CashfreeGateway', () => {
  let gateway: CashfreeGateway;
  let configServiceMock: jest.Mocked<ConfigService>;

  const mockAppId = 'cf_app_id_123';
  const mockSecretKey = 'cf_secret_xyz456';

  beforeEach(async () => {
    configServiceMock = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'CASHFREE_APP_ID') return mockAppId;
        if (key === 'CASHFREE_SECRET_KEY') return mockSecretKey;
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashfreeGateway,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    gateway = module.get<CashfreeGateway>(CashfreeGateway);
  });

  describe('initialization', () => {
    it('should set provider to CASHFREE', () => {
      expect(gateway.provider).toBe(PaymentGateway.CASHFREE);
    });
  });

  describe('createOrder', () => {
    it('should call Cashfree PGCreateOrder with decimal amount and return action', async () => {
      // Arrange
      const mockCfOrder = {
        order_id: 'rcpt_123',
        cf_order_id: '12345678',
        order_amount: 399.0,
        order_currency: 'INR',
        payment_session_id: 'session_abc123',
        created_at: '2026-10-08T12:00:00Z',
      };
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGCreateOrder').mockResolvedValue({
        data: mockCfOrder,
      } as any);

      // Act
      const result = await gateway.createOrder({
        amount: 39900, // 39900 paise = 399.00 INR
        currency: 'INR',
        receipt: 'rcpt_123',
        userId: 'user_ulid_123',
        userContact: '+919999999999',
        userName: 'Test User',
      });

      // Assert
      expect(client.PGCreateOrder).toHaveBeenCalledWith({
        order_id: 'rcpt_123',
        order_amount: 399.0,
        order_currency: 'INR',
        customer_details: {
          customer_id: 'user_ulid_123',
          customer_phone: '+919999999999',
          customer_name: 'Test User',
          customer_email: undefined,
        },
      });
      expect(result).toEqual({
        gatewayOrderId: 'rcpt_123',
        gatewayCreatedAt: DateUtil.parse('2026-10-08T12:00:00Z'),
        action: {
          type: 'sdk',
          keyId: mockAppId,
          gatewayOrderId: 'rcpt_123',
          paymentSessionId: 'session_abc123',
          prefill: {
            contact: '+919999999999',
            name: 'Test User',
          },
        },
      });
    });

    it('should throw GatewayOrderCreationException when Cashfree API call fails', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGCreateOrder').mockRejectedValue({
        response: { data: { message: 'Customer phone is invalid' } },
      });

      // Act & Assert
      await expect(
        gateway.createOrder({
          amount: 39900,
          currency: 'INR',
          receipt: 'rcpt_123',
          userId: 'user_123',
        }),
      ).rejects.toThrow(GatewayOrderCreationException);
    });
  });

  describe('fetchOrderStatus', () => {
    it('should return CAPTURED when Cashfree order_status is PAID', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGFetchOrder').mockResolvedValue({
        data: { order_status: 'PAID' },
      } as any);

      const status = await gateway.fetchOrderStatus('order_123');
      expect(status).toBe(GatewayOrderStatus.CAPTURED);
    });

    it('should return PENDING when Cashfree order_status is ACTIVE', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGFetchOrder').mockResolvedValue({
        data: { order_status: 'ACTIVE' },
      } as any);

      const status = await gateway.fetchOrderStatus('order_123');
      expect(status).toBe(GatewayOrderStatus.PENDING);
    });

    it('should return CANCELLED when Cashfree order_status is EXPIRED', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGFetchOrder').mockResolvedValue({
        data: { order_status: 'EXPIRED' },
      } as any);

      const status = await gateway.fetchOrderStatus('order_123');
      expect(status).toBe(GatewayOrderStatus.CANCELLED);
    });

    it('should return FAILED when Cashfree order_status is TERMINATED', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGFetchOrder').mockResolvedValue({
        data: { order_status: 'TERMINATED' },
      } as any);

      const status = await gateway.fetchOrderStatus('order_123');
      expect(status).toBe(GatewayOrderStatus.FAILED);
    });

    it('should return PENDING when Cashfree fetch throws an error', async () => {
      const client = (gateway as any).client;
      jest
        .spyOn(client, 'PGFetchOrder')
        .mockRejectedValue(new Error('Network error'));

      const status = await gateway.fetchOrderStatus('order_123');
      expect(status).toBe(GatewayOrderStatus.PENDING);
    });
  });

  describe('fetchCapturedPaymentId', () => {
    it('should return cf_payment_id for payment with SUCCESS status', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGOrderFetchPayments').mockResolvedValue({
        data: [
          { cf_payment_id: 11111, payment_status: 'FAILED' },
          { cf_payment_id: 22222, payment_status: 'SUCCESS' },
        ],
      } as any);

      const paymentId = await gateway.fetchCapturedPaymentId('order_123');
      expect(paymentId).toBe('22222');
    });

    it('should return null if no SUCCESS payment exists', async () => {
      const client = (gateway as any).client;
      jest.spyOn(client, 'PGOrderFetchPayments').mockResolvedValue({
        data: [{ cf_payment_id: 11111, payment_status: 'FAILED' }],
      } as any);

      const paymentId = await gateway.fetchCapturedPaymentId('order_123');
      expect(paymentId).toBeNull();
    });

    it('should return null if API fails', async () => {
      const client = (gateway as any).client;
      jest
        .spyOn(client, 'PGOrderFetchPayments')
        .mockRejectedValue(new Error('API failure'));

      const paymentId = await gateway.fetchCapturedPaymentId('order_123');
      expect(paymentId).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('should return false as Cashfree does not provide browser client-side signatures', () => {
      expect(
        gateway.verifySignature({
          gatewayOrderId: 'order_123',
          gatewayPaymentId: 'pay_123',
          signature: 'sig_123',
        }),
      ).toBe(false);
    });
  });
});

import { createHmac } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';

import { GatewayOrderCreationException } from '../application/exceptions';
import { GatewayOrderStatus } from '../gateways/payment-gateway.interface';
import { RazorpayGateway } from '../gateways/razorpay/razorpay.gateway';

describe('RazorpayGateway', () => {
  let gateway: RazorpayGateway;
  let configServiceMock: jest.Mocked<ConfigService>;

  const mockKeyId = 'rzp_test_key123';
  const mockKeySecret = 'rzp_secret_xyz456';

  beforeEach(async () => {
    configServiceMock = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'RAZORPAY_KEY_ID') return mockKeyId;
        if (key === 'RAZORPAY_KEY_SECRET') return mockKeySecret;
        throw new Error(`Unexpected key: ${key}`);
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RazorpayGateway,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    gateway = module.get<RazorpayGateway>(RazorpayGateway);
  });

  describe('initialization', () => {
    it('should set provider to RAZORPAY', () => {
      expect(gateway.provider).toBe(PaymentGateway.RAZORPAY);
    });
  });

  describe('createOrder', () => {
    it('should call razorpay orders.create and format action response', async () => {
      // Arrange
      const mockRzpOrder = {
        id: 'order_12345',
        created_at: 1700000000,
        status: 'created',
      };
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'create')
        .mockResolvedValue(mockRzpOrder as any);

      // Act
      const result = await gateway.createOrder({
        amount: 50000,
        currency: 'INR',
        receipt: 'rcpt_123',
        userContact: '+919999999999',
        userName: 'Test User',
      });

      // Assert
      expect(client.orders.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'INR',
        receipt: 'rcpt_123',
      });
      expect(result).toEqual({
        gatewayOrderId: 'order_12345',
        gatewayCreatedAt: DateUtil.parse(1700000000 * 1000),
        action: {
          type: 'sdk',
          keyId: mockKeyId,
          gatewayOrderId: 'order_12345',
          prefill: {
            contact: '+919999999999',
            name: 'Test User',
          },
        },
      });
    });

    it('should throw GatewayOrderCreationException when razorpay orders.create fails', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'create')
        .mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(
        gateway.createOrder({
          amount: 50000,
          currency: 'INR',
          receipt: 'rcpt_123',
        }),
      ).rejects.toThrow(GatewayOrderCreationException);
    });
  });

  describe('fetchOrderStatus', () => {
    it('should return CAPTURED when razorpay order status is paid', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'fetch')
        .mockResolvedValue({ status: 'paid' } as any);

      // Act
      const status = await gateway.fetchOrderStatus('order_123');

      // Assert
      expect(status).toBe(GatewayOrderStatus.CAPTURED);
    });

    it('should return FAILED when razorpay order is attempted and has failed payments', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'fetch')
        .mockResolvedValue({ status: 'attempted' } as any);
      jest
        .spyOn(client.orders, 'fetchPayments')
        .mockResolvedValue({ items: [{ status: 'failed' }] } as any);

      // Act
      const status = await gateway.fetchOrderStatus('order_123');

      // Assert
      expect(status).toBe(GatewayOrderStatus.FAILED);
    });

    it('should return PENDING when razorpay order is created', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'fetch')
        .mockResolvedValue({ status: 'created' } as any);

      // Act
      const status = await gateway.fetchOrderStatus('order_123');

      // Assert
      expect(status).toBe(GatewayOrderStatus.PENDING);
    });

    it('should return PENDING when fetch rejects', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'fetch')
        .mockRejectedValue(new Error('Gateway down'));

      // Act
      const status = await gateway.fetchOrderStatus('order_123');

      // Assert
      expect(status).toBe(GatewayOrderStatus.PENDING);
    });
  });

  describe('fetchCapturedPaymentId', () => {
    it('should return captured payment ID when present', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest.spyOn(client.orders, 'fetchPayments').mockResolvedValue({
        items: [
          { id: 'pay_failed_1', status: 'failed' },
          { id: 'pay_captured_1', status: 'captured' },
        ],
      } as any);

      // Act
      const paymentId = await gateway.fetchCapturedPaymentId('order_123');

      // Assert
      expect(paymentId).toBe('pay_captured_1');
    });

    it('should return null when fetchPayments fails', async () => {
      // Arrange
      const client = (gateway as any).client;
      jest
        .spyOn(client.orders, 'fetchPayments')
        .mockRejectedValue(new Error('Fetch failed'));

      // Act
      const paymentId = await gateway.fetchCapturedPaymentId('order_123');

      // Assert
      expect(paymentId).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('should return true for a valid HMAC-SHA256 signature', () => {
      // Arrange
      const gatewayOrderId = 'order_valid_123';
      const gatewayPaymentId = 'pay_valid_456';
      const payload = `${gatewayOrderId}|${gatewayPaymentId}`;
      const validSignature = createHmac('sha256', mockKeySecret)
        .update(payload)
        .digest('hex');

      // Act
      const isValid = gateway.verifySignature({
        gatewayOrderId,
        gatewayPaymentId,
        signature: validSignature,
      });

      // Assert
      expect(isValid).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      // Act
      const isValid = gateway.verifySignature({
        gatewayOrderId: 'order_123',
        gatewayPaymentId: 'pay_456',
        signature: 'invalid_hex_signature',
      });

      // Assert
      expect(isValid).toBe(false);
    });
  });
});

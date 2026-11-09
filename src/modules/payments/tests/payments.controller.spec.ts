import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { PaymentGateway, PaymentOrderStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import {
  PAYMENTS_ORDER_THROTTLE,
  PAYMENTS_VERIFY_THROTTLE,
} from '../constants';
import {
  CreateOrderRequestDto,
  CreateOrderResponseDto,
  OrderStatusResponseDto,
  VerifyOrderRequestDto,
  VerifyOrderResponseDto,
} from '../dto';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: jest.Mocked<PaymentsService>;
  let reflector: Reflector;

  const userId = 'user_01J8VXYZ';
  const orderId = 'order_01J8VXYZ';

  beforeEach(async () => {
    const mockService = {
      createOrder: jest.fn(),
      getOrderStatus: jest.fn(),
      verifyPayment: jest.fn(),
    };

    const loggerServiceMock = {
      forContext: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        Reflector,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: PaymentsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    service = module.get(PaymentsService);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Throttle Metadata Verification', () => {
    it('should attach strict throttling metadata to createOrder', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.createOrder,
      );
      const mediumLimit = reflector.get(
        THROTTLER_LIMIT + 'medium',
        controller.createOrder,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.createOrder,
      );

      expect(shortLimit).toBe(PAYMENTS_ORDER_THROTTLE.short.limit);
      expect(mediumLimit).toBe(PAYMENTS_ORDER_THROTTLE.medium.limit);
      expect(longLimit).toBe(PAYMENTS_ORDER_THROTTLE.long.limit);

      const shortTtl = reflector.get(
        THROTTLER_TTL + 'short',
        controller.createOrder,
      );
      const mediumTtl = reflector.get(
        THROTTLER_TTL + 'medium',
        controller.createOrder,
      );
      const longTtl = reflector.get(
        THROTTLER_TTL + 'long',
        controller.createOrder,
      );

      expect(shortTtl).toBe(PAYMENTS_ORDER_THROTTLE.short.ttl);
      expect(mediumTtl).toBe(PAYMENTS_ORDER_THROTTLE.medium.ttl);
      expect(longTtl).toBe(PAYMENTS_ORDER_THROTTLE.long.ttl);
    });

    it('should attach strict throttling metadata to verifyPayment', () => {
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.verifyPayment,
      );
      const mediumLimit = reflector.get(
        THROTTLER_LIMIT + 'medium',
        controller.verifyPayment,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.verifyPayment,
      );

      expect(shortLimit).toBe(PAYMENTS_VERIFY_THROTTLE.short.limit);
      expect(mediumLimit).toBe(PAYMENTS_VERIFY_THROTTLE.medium.limit);
      expect(longLimit).toBe(PAYMENTS_VERIFY_THROTTLE.long.limit);

      const shortTtl = reflector.get(
        THROTTLER_TTL + 'short',
        controller.verifyPayment,
      );
      const mediumTtl = reflector.get(
        THROTTLER_TTL + 'medium',
        controller.verifyPayment,
      );
      const longTtl = reflector.get(
        THROTTLER_TTL + 'long',
        controller.verifyPayment,
      );

      expect(shortTtl).toBe(PAYMENTS_VERIFY_THROTTLE.short.ttl);
      expect(mediumTtl).toBe(PAYMENTS_VERIFY_THROTTLE.medium.ttl);
      expect(longTtl).toBe(PAYMENTS_VERIFY_THROTTLE.long.ttl);
    });
  });

  describe('createOrder', () => {
    it('should delegate to paymentsService.createOrder with client IP', async () => {
      // Arrange
      const dto: CreateOrderRequestDto = { planId: 'plan_123' };
      const clientIp = '127.0.0.1';
      const expectedResponse: CreateOrderResponseDto = {
        orderId,
        provider: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        amount: 49900,
        currency: 'INR',
        action: {
          type: 'sdk',
          keyId: 'rzp_test_123',
          gatewayOrderId: 'order_rzp_123',
        },
      };

      service.createOrder.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.createOrder(userId, dto, clientIp);

      // Assert
      expect(result).toBe(expectedResponse);
      expect(service.createOrder).toHaveBeenCalledWith(
        userId,
        dto,
        '127.0.0.1',
      );
    });
  });

  describe('getOrderStatus', () => {
    it('should delegate to paymentsService.getOrderStatus', async () => {
      // Arrange
      const expectedResponse: OrderStatusResponseDto = {
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      };

      service.getOrderStatus.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.getOrderStatus(userId, orderId);

      // Assert
      expect(result).toBe(expectedResponse);
      expect(service.getOrderStatus).toHaveBeenCalledWith(userId, orderId);
    });
  });

  describe('verifyPayment', () => {
    it('should delegate to paymentsService.verifyPayment', async () => {
      // Arrange
      const dto: VerifyOrderRequestDto = {
        razorpay_order_id: 'order_rzp_123',
        razorpay_payment_id: 'pay_rzp_456',
        razorpay_signature: 'sig_789',
      };
      const expectedResponse: VerifyOrderResponseDto = {
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      };

      service.verifyPayment.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.verifyPayment(userId, orderId, dto);

      // Assert
      expect(result).toBe(expectedResponse);
      expect(service.verifyPayment).toHaveBeenCalledWith(userId, orderId, dto);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway, PaymentOrderStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

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
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: PaymentsService, useValue: mockService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    service = module.get(PaymentsService);
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

import { UnauthorizedException } from '@nestjs/common';
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
import { IpGeolocationService } from '@infrastructure/ip-geolocation';
import { CreditsService } from '@modules/credits/credits.service';
import { IdentitiesService } from '@modules/identities/identities.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import {
  SubscriptionPlanNotFoundException,
  SubscriptionPlanPriceNotFoundException,
} from '@modules/subscriptions/application/exceptions';

import {
  GatewayNotAvailableException,
  OrderNotFoundException,
} from '../application/exceptions';
import {
  PAYMENT_COMPLETED_EVENT,
  PaymentCompletedEvent,
} from '../events/payment-completed.event';
import { GatewayOrderStatus } from '../gateways/payment-gateway.interface';
import { CashfreeGateway } from '../gateways/cashfree/cashfree.gateway';
import { RazorpayGateway } from '../gateways/razorpay/razorpay.gateway';
import { PaymentsService } from '../payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: MockPrismaService;
  let creditsServiceMock: jest.Mocked<CreditsService>;
  let transactionsServiceMock: jest.Mocked<TransactionsService>;
  let ipGeolocationServiceMock: jest.Mocked<IpGeolocationService>;
  let identitiesServiceMock: jest.Mocked<
    Pick<IdentitiesService, 'getUserPhoneNumber'>
  >;
  let razorpayGatewayMock: jest.Mocked<RazorpayGateway>;
  let cashfreeGatewayMock: jest.Mocked<CashfreeGateway>;
  let eventEmitterMock: { emit: jest.Mock };

  const userId = 'user_01J8VXYZ';
  const planId = 'plan_01J8VXYZ';
  const orderId = 'order_01J8VXYZ';

  beforeEach(async () => {
    prisma = createPrismaMock();

    creditsServiceMock = {
      grantCredits: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CreditsService>;

    transactionsServiceMock = {
      record: jest.fn().mockResolvedValue({ id: 'tx_01J8VXYZ' }),
    } as unknown as jest.Mocked<TransactionsService>;

    ipGeolocationServiceMock = {
      getCountryCodeByIp: jest.fn().mockResolvedValue('IN'),
    } as unknown as jest.Mocked<IpGeolocationService>;

    identitiesServiceMock = {
      getUserPhoneNumber: jest.fn().mockResolvedValue('+919876543210'),
    };

    razorpayGatewayMock = {
      provider: PaymentGateway.RAZORPAY,
      createOrder: jest.fn().mockResolvedValue({
        gatewayOrderId: 'order_rzp_123',
        gatewayCreatedAt: DateUtil.now(),
        action: {
          type: 'sdk',
          keyId: 'rzp_test_123',
          gatewayOrderId: 'order_rzp_123',
        },
      }),
      fetchOrderStatus: jest
        .fn()
        .mockResolvedValue(GatewayOrderStatus.CAPTURED),
      verifySignature: jest.fn().mockReturnValue(true),
      fetchCapturedPaymentId: jest.fn().mockResolvedValue('pay_rzp_456'),
    } as unknown as jest.Mocked<RazorpayGateway>;

    cashfreeGatewayMock = {
      provider: PaymentGateway.CASHFREE,
      createOrder: jest.fn().mockResolvedValue({
        gatewayOrderId: 'order_cf_123',
        gatewayCreatedAt: DateUtil.now(),
        action: {
          type: 'sdk',
          keyId: 'cf_test_123',
          gatewayOrderId: 'order_cf_123',
          paymentSessionId: 'session_cf_123',
        },
      }),
      fetchOrderStatus: jest
        .fn()
        .mockResolvedValue(GatewayOrderStatus.CAPTURED),
      verifySignature: jest.fn().mockReturnValue(false),
      fetchCapturedPaymentId: jest.fn().mockResolvedValue('pay_cf_456'),
    } as unknown as jest.Mocked<CashfreeGateway>;

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
          if (key === 'DEFAULT_COUNTRY_CODE') return 'IN';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CreditsService, useValue: creditsServiceMock },
        { provide: TransactionsService, useValue: transactionsServiceMock },
        {
          provide: IpGeolocationService,
          useValue: ipGeolocationServiceMock,
        },
        { provide: IdentitiesService, useValue: identitiesServiceMock },
        { provide: RazorpayGateway, useValue: razorpayGatewayMock },
        { provide: CashfreeGateway, useValue: cashfreeGatewayMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    // Mock $transaction to execute the callback directly
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(prisma);
    });
  });

  describe('createOrder', () => {
    it('should create an order successfully with user countryCode', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
        firstName: 'John',
      });
      (prisma.paymentOrder.create as jest.Mock).mockResolvedValue({
        id: orderId,
      });

      // Act
      const result = await service.createOrder(userId, { planId });

      // Assert
      expect(result).toEqual({
        orderId,
        provider: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        amount: 49900,
        currency: 'INR',
        action: expect.objectContaining({
          type: 'sdk',
          gatewayOrderId: 'order_rzp_123',
        }),
      });
      expect(razorpayGatewayMock.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 49900,
          currency: 'INR',
          userName: 'John',
          userContact: '+919876543210',
        }),
      );
      expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          planId,
          amount: 49900,
          currency: 'INR',
          countryCode: 'IN',
          gateway: PaymentGateway.RAZORPAY,
          status: PaymentOrderStatus.PENDING,
          gatewayOrderId: 'order_rzp_123',
        }),
        select: { id: true },
      });
    });

    it('should create order using Cashfree when priority route selects CASHFREE', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue({
        gateway: PaymentGateway.CASHFREE,
        priority: 1,
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
        firstName: 'John',
      });
      (prisma.paymentOrder.create as jest.Mock).mockResolvedValue({
        id: orderId,
      });

      // Act
      const result = await service.createOrder(userId, { planId });

      // Assert
      expect(cashfreeGatewayMock.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 49900,
          currency: 'INR',
          userId,
        }),
      );
      expect(result.provider).toBe(PaymentGateway.CASHFREE);
      expect(result.action.paymentSessionId).toBe('session_cf_123');
    });

    it('should override user contact when explicit contact is provided in DTO', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
        firstName: 'John',
      });
      (prisma.paymentOrder.create as jest.Mock).mockResolvedValue({
        id: orderId,
      });

      // Act
      await service.createOrder(userId, {
        planId,
        contact: '+919999988888',
      });

      // Assert
      expect(razorpayGatewayMock.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userContact: '+919999988888',
        }),
      );
    });

    it('should fall back to undefined userContact when user has no verified phone and no override', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
        firstName: 'John',
      });
      (prisma.paymentOrder.create as jest.Mock).mockResolvedValue({
        id: orderId,
      });
      identitiesServiceMock.getUserPhoneNumber.mockResolvedValue(null);

      // Act
      await service.createOrder(userId, { planId });

      // Assert
      expect(razorpayGatewayMock.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userContact: undefined,
          userName: 'John',
        }),
      );
    });

    it('should use IP geolocation when user countryCode is absent', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: null,
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue({
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.paymentOrder.create as jest.Mock).mockResolvedValue({
        id: orderId,
      });

      // Act
      await service.createOrder(userId, { planId }, '1.2.3.4');

      // Assert
      expect(ipGeolocationServiceMock.getCountryCodeByIp).toHaveBeenCalledWith(
        '1.2.3.4',
      );
    });

    it('should throw PlanNotFoundException when plan is inactive or missing', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.createOrder(userId, { planId })).rejects.toThrow(
        SubscriptionPlanNotFoundException,
      );
    });

    it('should throw SubscriptionPlanPriceNotFoundException when price is missing for country', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'US',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(service.createOrder(userId, { planId })).rejects.toThrow(
        SubscriptionPlanPriceNotFoundException,
      );
    });

    it('should throw GatewayNotAvailableException when no route is available', async () => {
      // Arrange
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        countryCode: 'IN',
      });
      (prisma.subscriptionPlan.findFirst as jest.Mock).mockResolvedValue({
        id: planId,
        creditsGranted: 10,
        validityDays: 30,
      });
      (prisma.subscriptionPlanPrice.findFirst as jest.Mock).mockResolvedValue({
        price: new Prisma.Decimal(499),
        currencyCode: 'INR',
      });
      (prisma.paymentGatewayRoute.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(service.createOrder(userId, { planId })).rejects.toThrow(
        GatewayNotAvailableException,
      );
    });
  });

  describe('getOrderStatus', () => {
    it('should return order status and creditsGranted', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        status: PaymentOrderStatus.PAID,
        transaction: { creditsGranted: 10 },
      });

      // Act
      const result = await service.getOrderStatus(userId, orderId);

      // Assert
      expect(result).toEqual({
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      });
    });

    it('should throw OrderNotFoundException when order does not exist or user mismatch', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getOrderStatus(userId, orderId)).rejects.toThrow(
        OrderNotFoundException,
      );
    });
  });

  describe('verifyPayment', () => {
    const verifyDto = {
      razorpay_order_id: 'order_rzp_123',
      razorpay_payment_id: 'pay_rzp_456',
      razorpay_signature: 'sig_valid_789',
    };

    it('should verify signature and fulfill order atomically', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: orderId,
        userId,
        planId,
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        plan: { id: planId, creditsGranted: 10, validityDays: 30 },
        transaction: null,
      });

      (prisma.paymentOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.verifyPayment(userId, orderId, verifyDto);

      // Assert
      expect(result).toEqual({
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      });
      expect(razorpayGatewayMock.verifySignature).toHaveBeenCalledWith({
        gatewayOrderId: verifyDto.razorpay_order_id,
        gatewayPaymentId: verifyDto.razorpay_payment_id,
        signature: verifyDto.razorpay_signature,
      });
      expect(transactionsServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          gateway: PaymentGateway.RAZORPAY,
          gatewayTransactionId: verifyDto.razorpay_payment_id,
          productId: planId,
          creditsGranted: 10,
          rawPayload: verifyDto,
        }),
        prisma,
      );
      expect(creditsServiceMock.grantCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          amount: 10,
          source: CreditSource.PURCHASE,
          referenceId: 'tx_01J8VXYZ',
        }),
        prisma,
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        PAYMENT_COMPLETED_EVENT,
        expect.any(PaymentCompletedEvent),
      );
    });

    it('should return existing creditsGranted if order already PAID (idempotent)', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: orderId,
        userId,
        status: PaymentOrderStatus.PAID,
        transaction: { creditsGranted: 10 },
      });

      // Act
      const result = await service.verifyPayment(userId, orderId, verifyDto);

      // Assert
      expect(result).toEqual({
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      });
      expect(razorpayGatewayMock.verifySignature).not.toHaveBeenCalled();
      expect(creditsServiceMock.grantCredits).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when signature is invalid', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: orderId,
        userId,
        planId,
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentOrderStatus.PENDING,
        plan: { id: planId, creditsGranted: 10, validityDays: 30 },
      });
      razorpayGatewayMock.verifySignature.mockReturnValue(false);

      // Act & Assert
      await expect(
        service.verifyPayment(userId, orderId, verifyDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should verify Cashfree order on-demand via fetchOrderStatus and fulfill', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: orderId,
        userId,
        planId,
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.CASHFREE,
        gatewayOrderId: 'order_cf_123',
        status: PaymentOrderStatus.PENDING,
        plan: { id: planId, creditsGranted: 10, validityDays: 30 },
        transaction: null,
      });

      cashfreeGatewayMock.fetchOrderStatus.mockResolvedValueOnce(
        GatewayOrderStatus.CAPTURED,
      );
      cashfreeGatewayMock.fetchCapturedPaymentId.mockResolvedValueOnce(
        'pay_cf_456',
      );
      (prisma.paymentOrder.update as jest.Mock).mockResolvedValue({});

      // Act
      const result = await service.verifyPayment(userId, orderId, {});

      // Assert
      expect(result).toEqual({
        status: PaymentOrderStatus.PAID,
        creditsGranted: 10,
      });
      expect(cashfreeGatewayMock.fetchOrderStatus).toHaveBeenCalledWith(
        'order_cf_123',
      );
      expect(transactionsServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          gateway: PaymentGateway.CASHFREE,
          gatewayTransactionId: 'pay_cf_456',
        }),
        prisma,
      );
    });

    it('should throw UnauthorizedException when Cashfree order is not captured', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue({
        id: orderId,
        userId,
        planId,
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.CASHFREE,
        gatewayOrderId: 'order_cf_123',
        status: PaymentOrderStatus.PENDING,
        plan: { id: planId, creditsGranted: 10, validityDays: 30 },
        transaction: null,
      });

      cashfreeGatewayMock.fetchOrderStatus.mockResolvedValueOnce(
        GatewayOrderStatus.PENDING,
      );

      // Act & Assert
      await expect(service.verifyPayment(userId, orderId, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw OrderNotFoundException when order does not exist', async () => {
      // Arrange
      (prisma.paymentOrder.findFirst as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.verifyPayment(userId, orderId, verifyDto),
      ).rejects.toThrow(OrderNotFoundException);
    });
  });

  describe('fulfil idempotency', () => {
    it('should handle P2002 error gracefully on concurrent redelivery', async () => {
      // Arrange
      const order = {
        id: orderId,
        userId,
        planId,
        plan: { id: planId, creditsGranted: 10, validityDays: 30 },
        amount: 49900,
        currency: 'INR',
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
      };

      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      (prisma.paymentOrder.findUnique as jest.Mock).mockResolvedValue({
        transaction: { creditsGranted: 10 },
      });

      // Act
      const creditsGranted = await service.fulfil({
        order,
        gatewayPaymentId: 'pay_123',
        gatewayOrderId: 'order_123',
        ctx: {},
      });

      // Assert
      expect(creditsGranted).toBe(10);
    });
  });
});

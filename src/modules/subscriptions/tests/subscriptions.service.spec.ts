import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SubscriptionNotFoundException,
  InvalidSubscriptionDatesException,
} from '../application/exceptions';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditSource,
  CurrencyCode,
  StorePlatform,
  SubscriptionEventType,
  SubscriptionStatus,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType } from '@modules/audit/dto';
import { CreditsService } from '@modules/credits/credits.service';

import { AppleSubscriptionService } from '../services/apple-subscription.service';
import { GoogleSubscriptionService } from '../services/google-subscription.service';
import { SubscriptionPlansService } from '../services/subscription-plans.service';
import { SubscriptionsService } from '../services/subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: MockPrismaService;
  let creditsService: jest.Mocked<CreditsService>;
  let subscriptionPlansService: jest.Mocked<SubscriptionPlansService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const userId = 'user-uuid-123';
  const subId = 'sub-uuid-abc';
  const storeTransactionId = 'store-tx-999';
  const storeProductId = 'prod-premium';

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue(mockLogger),
  };

  const mockPlan = {
    id: 'plan-uuid-111',
    name: 'Premium Plan',
    slug: 'premium',
    description: 'Premium access tier',
    appleProductId: 'apple-prod-premium',
    googleProductId: 'google-prod-premium',
    creditsGranted: 100,
    validityDays: 30,
    trialDurationDays: 0,
    sortOrder: 1,
    status: 'ACTIVE',
  };

  const mockSubscription = {
    id: subId,
    userId,
    planId: 'plan-uuid-111',
    status: SubscriptionStatus.ACTIVE,
    storePlatform: StorePlatform.APPLE,
    storeTransactionId,
    storeProductId,
    currentPeriodStart: new Date('2026-06-28T00:00:00Z'),
    currentPeriodEnd: new Date('2026-07-28T00:00:00Z'),
    expiresAt: new Date('2026-07-28T00:00:00Z'),
    autoRenewing: true,
    currencyCode: CurrencyCode.USD,
    pricePaid: 9.99 as any,
    countryCode: 'US',
    trialEnd: null as Date | null,
    createdAt: new Date('2026-06-28T00:00:00Z'),
    updatedAt: new Date('2026-06-28T00:00:00Z'),
    cancelledAt: null as Date | null,
    plan: mockPlan,
  };

  beforeEach(async () => {
    const mockCreditsService = {
      grantCredits: jest.fn().mockResolvedValue({ id: 'credit-grant-id' }),
    };

    const mockSubscriptionPlansService = {
      getPlanByStoreProductId: jest.fn().mockResolvedValue(mockPlan),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockClsService = {
      get: jest.fn().mockReturnValue('mock-ip'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: CreditsService, useValue: mockCreditsService },
        {
          provide: SubscriptionPlansService,
          useValue: mockSubscriptionPlansService,
        },
        {
          provide: AppleSubscriptionService,
          useValue: {
            parseNotification: jest.fn(),
            mapNotificationType: jest.fn(),
          },
        },
        {
          provide: GoogleSubscriptionService,
          useValue: {
            verifyPurchase: jest.fn(),
            mapNotificationType: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    prisma = module.get(PrismaService);
    creditsService = module.get(CreditsService);
    subscriptionPlansService = module.get(SubscriptionPlansService);
    eventEmitter = module.get(EventEmitter2);

    // Standard Prisma mock transaction implementation
    prisma.$transaction.mockImplementation(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return callback;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveSubscription', () => {
    it('should query active or grace period subscription and return it', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);

      // Act
      const result = await service.getActiveSubscription(userId);

      // Assert
      expect(prisma.userSubscription.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD],
          },
        },
        include: { plan: { include: { prices: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should return null if no active subscription is found', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.getActiveSubscription(userId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should return all subscriptions for user including events ordered by createdAt desc', async () => {
      // Arrange
      prisma.userSubscription.findMany.mockResolvedValue([mockSubscription]);

      // Act
      const result = await service.getSubscriptionHistory(userId);

      // Assert
      expect(prisma.userSubscription.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          plan: true,
          events: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockSubscription]);
    });
  });

  describe('verifyAndCreateSubscription', () => {
    const dto = {
      storePlatform: StorePlatform.APPLE,
      productId: storeProductId,
      purchaseToken: storeTransactionId,
      purchaseDate: '2026-06-28T00:00:00Z',
      expiresDate: '2026-07-28T00:00:00Z',
    };

    it('should return existing subscription if already processed (idempotency)', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);

      // Act
      const result = await service.verifyAndCreateSubscription(userId, dto);

      // Assert
      expect(prisma.userSubscription.findFirst).toHaveBeenCalledWith({
        where: { storeTransactionId: dto.purchaseToken },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockSubscription);
      expect(
        subscriptionPlansService.getPlanByStoreProductId,
      ).not.toHaveBeenCalled();
    });

    it('should fetch plan, calculate dates, and route to handleInitialPurchase if new', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null); // not existing initially
      // For handleInitialPurchase internal idempotency check, also return null
      prisma.userSubscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.userSubscription.create.mockResolvedValue(mockSubscription);

      // Act
      const result = await service.verifyAndCreateSubscription(userId, dto);

      // Assert
      expect(
        subscriptionPlansService.getPlanByStoreProductId,
      ).toHaveBeenCalledWith(dto.storePlatform, dto.productId);
      expect(result).toEqual(mockSubscription);
    });

    it('should throw InvalidSubscriptionDatesException if expiresDate is before or equal to purchaseDate', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      const invalidDto = {
        ...dto,
        purchaseDate: '2026-07-28T00:00:00Z',
        expiresDate: '2026-06-28T00:00:00Z',
      };

      // Act & Assert
      await expect(
        service.verifyAndCreateSubscription(userId, invalidDto),
      ).rejects.toThrow(new InvalidSubscriptionDatesException());
    });

    it('should calculate dates from plan validityDays if not provided in dto', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      prisma.userSubscription.create.mockResolvedValue(mockSubscription);

      const minimalDto = {
        storePlatform: StorePlatform.APPLE,
        productId: storeProductId,
        purchaseToken: storeTransactionId,
      };

      // Act
      await service.verifyAndCreateSubscription(userId, minimalDto);

      // Assert
      expect(prisma.userSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentPeriodStart: expect.any(Date),
            currentPeriodEnd: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('handleInitialPurchase', () => {
    const params = {
      userId,
      storePlatform: StorePlatform.APPLE,
      storeTransactionId,
      storeProductId,
      purchaseDate: new Date('2026-06-28T00:00:00Z'),
      expiresDate: new Date('2026-07-28T00:00:00Z'),
      currencyCode: CurrencyCode.USD,
      pricePaid: 9.99,
      countryCode: 'US',
      rawPayload: { key: 'val' },
      storeEventId: 'evt-111',
    };

    it('should skip creation if subscription already exists for storeTransactionId', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);

      // Act
      const result = await service.handleInitialPurchase(params);

      // Assert
      expect(prisma.userSubscription.findFirst).toHaveBeenCalledWith({
        where: { storeTransactionId: params.storeTransactionId },
        include: { plan: true },
      });
      expect(prisma.userSubscription.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockSubscription);
    });

    it('should create subscription, log event, grant credits, and emit audit log', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null);
      prisma.userSubscription.create.mockResolvedValue(mockSubscription);

      // Act
      const result = await service.handleInitialPurchase(params);

      // Assert
      expect(prisma.userSubscription.create).toHaveBeenCalledWith({
        data: {
          userId: params.userId,
          planId: mockPlan.id,
          status: SubscriptionStatus.ACTIVE,
          storePlatform: params.storePlatform,
          storeTransactionId: params.storeTransactionId,
          storeProductId: params.storeProductId,
          currentPeriodStart: params.purchaseDate,
          currentPeriodEnd: params.expiresDate,
          expiresAt: params.expiresDate,
          autoRenewing: true,
          currencyCode: params.currencyCode,
          pricePaid: params.pricePaid,
          countryCode: params.countryCode,
        },
      });
      expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
        data: {
          subscriptionId: mockSubscription.id,
          eventType: SubscriptionEventType.INITIAL_PURCHASE,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
      });
      expect(creditsService.grantCredits).toHaveBeenCalledWith(
        {
          userId: params.userId,
          amount: mockPlan.creditsGranted,
          source: CreditSource.SUBSCRIPTION,
          referenceId: mockSubscription.id,
          expiresAt: params.expiresDate.toISOString(),
        },
        prisma,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_CREATED,
          resourceId: mockSubscription.id,
        }),
      );
      expect(result).toEqual(mockSubscription);
    });
  });

  describe('handleRenewal', () => {
    const params = {
      storeTransactionId,
      storePlatform: StorePlatform.APPLE,
      newPeriodStart: new Date('2026-07-28T00:00:00Z'),
      newPeriodEnd: new Date('2026-08-28T00:00:00Z'),
      rawPayload: { val: 2 },
      storeEventId: 'evt-222',
    };

    it('should ignore if the event has already been processed', async () => {
      // Arrange
      prisma.subscriptionEvent.findFirst.mockResolvedValue({
        id: 'existing-evt',
      } as any);

      // Act
      const result = await service.handleRenewal(params);

      // Assert
      expect(result).toBeUndefined();
      expect(prisma.userSubscription.update).not.toHaveBeenCalled();
    });

    it('should update subscription, log renewal event, grant credits, and emit audit log', async () => {
      // Arrange
      prisma.subscriptionEvent.findFirst.mockResolvedValue(null);
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        currentPeriodStart: params.newPeriodStart,
        currentPeriodEnd: params.newPeriodEnd,
        expiresAt: params.newPeriodEnd,
      });

      // Act
      const result = await service.handleRenewal(params);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: {
          currentPeriodStart: params.newPeriodStart,
          currentPeriodEnd: params.newPeriodEnd,
          expiresAt: params.newPeriodEnd,
          status: SubscriptionStatus.ACTIVE,
        },
        include: { plan: true },
      });
      expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
        data: {
          subscriptionId: mockSubscription.id,
          eventType: SubscriptionEventType.RENEWAL,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
      });
      expect(creditsService.grantCredits).toHaveBeenCalledWith(
        {
          userId: mockSubscription.userId,
          amount: mockPlan.creditsGranted,
          source: CreditSource.SUBSCRIPTION,
          referenceId: mockSubscription.id,
          expiresAt: params.newPeriodEnd.toISOString(),
        },
        prisma,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_RENEWED,
          resourceId: mockSubscription.id,
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('handleCancellation', () => {
    const params = {
      storeTransactionId,
      storePlatform: StorePlatform.APPLE,
      rawPayload: { cancel: true },
      storeEventId: 'evt-333',
    };

    it('should mark autoRenewing to false, set cancelledAt, and log cancellation event', async () => {
      // Arrange
      prisma.subscriptionEvent.findFirst.mockResolvedValue(null);
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        autoRenewing: false,
        cancelledAt: new Date(),
      });

      // Act
      await service.handleCancellation(params);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: {
          autoRenewing: false,
          cancelledAt: expect.any(Date),
        },
      });
      expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
        data: {
          subscriptionId: mockSubscription.id,
          eventType: SubscriptionEventType.CANCELLATION,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_CANCELLED,
          resourceId: mockSubscription.id,
        }),
      );
    });
  });

  describe('handleGracePeriod', () => {
    it('should update status to GRACE_PERIOD and log event', async () => {
      // Arrange
      const params = {
        storeTransactionId,
        storePlatform: StorePlatform.APPLE,
        storeEventId: 'evt-444',
      };
      prisma.subscriptionEvent.findFirst.mockResolvedValue(null);
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.GRACE_PERIOD,
      });

      // Act
      await service.handleGracePeriod(params);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: { status: SubscriptionStatus.GRACE_PERIOD },
      });
      expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
        data: {
          subscriptionId: mockSubscription.id,
          eventType: SubscriptionEventType.GRACE_PERIOD_ENTERED,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: undefined,
        },
      });
    });
  });

  describe('handleBillingRecovery', () => {
    it('should update status to ACTIVE, extend end date, grant credits, and log event', async () => {
      // Arrange
      const params = {
        storeTransactionId,
        storePlatform: StorePlatform.APPLE,
        newPeriodEnd: new Date('2026-08-28T00:00:00Z'),
        storeEventId: 'evt-555',
      };
      prisma.subscriptionEvent.findFirst.mockResolvedValue(null);
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: params.newPeriodEnd,
        expiresAt: params.newPeriodEnd,
      });

      // Act
      await service.handleBillingRecovery(params);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: params.newPeriodEnd,
          expiresAt: params.newPeriodEnd,
        },
        include: { plan: true },
      });
      expect(creditsService.grantCredits).toHaveBeenCalled();
    });
  });

  describe('handleRevocation', () => {
    it('should set status to REVOKED, log event, and emit audit log', async () => {
      // Arrange
      const params = {
        storeTransactionId,
        storePlatform: StorePlatform.APPLE,
        storeEventId: 'evt-666',
      };
      prisma.subscriptionEvent.findFirst.mockResolvedValue(null);
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.REVOKED,
      });

      // Act
      await service.handleRevocation(params);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: { status: SubscriptionStatus.REVOKED },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_REVOKED,
          resourceId: mockSubscription.id,
        }),
      );
    });
  });

  describe('handleExpiry', () => {
    it('should update status to EXPIRED and log event', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.userSubscription.update.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.EXPIRED,
      });

      // Act
      await service.handleExpiry(storeTransactionId, StorePlatform.APPLE);

      // Assert
      expect(prisma.userSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_EXPIRED,
        }),
      );
    });

    it('should skip expiry if subscription is already in terminal EXPIRED status', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.EXPIRED,
      });

      // Act
      await service.handleExpiry(storeTransactionId, StorePlatform.APPLE);

      // Assert
      expect(prisma.userSubscription.update).not.toHaveBeenCalled();
    });
  });

  describe('expireSubscriptions', () => {
    it('should do nothing if no subscriptions are past their expiration date', async () => {
      // Arrange
      prisma.userSubscription.findMany.mockResolvedValue([]);

      // Act
      const result = await service.expireSubscriptions();

      // Assert
      expect(result).toBe(0);
      expect(prisma.userSubscription.updateMany).not.toHaveBeenCalled();
    });

    it('should batch update status and batch log expiry events for expired subscriptions', async () => {
      // Arrange
      const expiredSub1 = { ...mockSubscription, id: 'expired-1' };
      const expiredSub2 = { ...mockSubscription, id: 'expired-2' };
      prisma.userSubscription.findMany.mockResolvedValue([
        expiredSub1,
        expiredSub2,
      ]);

      // Act
      const result = await service.expireSubscriptions();

      // Assert
      expect(result).toBe(2);
      expect(prisma.userSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['expired-1', 'expired-2'] } },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      expect(prisma.subscriptionEvent.createMany).toHaveBeenCalledWith({
        data: [
          {
            subscriptionId: 'expired-1',
            eventType: SubscriptionEventType.EXPIRY,
            storePlatform: StorePlatform.APPLE,
          },
          {
            subscriptionId: 'expired-2',
            eventType: SubscriptionEventType.EXPIRY,
            storePlatform: StorePlatform.APPLE,
          },
        ],
      });
    });
  });

  describe('findSubscriptionByStoreTransaction', () => {
    it('should return subscription if found', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(mockSubscription);

      // Act
      const result =
        await service.findSubscriptionByStoreTransaction(storeTransactionId);

      // Assert
      expect(result).toEqual(mockSubscription);
    });

    it('should throw SubscriptionNotFoundException if not found', async () => {
      // Arrange
      prisma.userSubscription.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.findSubscriptionByStoreTransaction('unknown-tx'),
      ).rejects.toThrow(
        new SubscriptionNotFoundException(
          'Subscription with store transaction ID "unknown-tx" not found',
        ),
      );
    });
  });
});

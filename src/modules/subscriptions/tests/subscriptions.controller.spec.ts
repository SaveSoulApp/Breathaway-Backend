import { Test, TestingModule } from '@nestjs/testing';
import { ActiveSubscriptionNotFoundException } from '../application/exceptions';
import { StorePlatform } from '@prisma/client';

import { LoggerService } from '@core/logger';

import { SubscriptionPlansService } from '../services/subscription-plans.service';
import { SubscriptionsService } from '../services/subscriptions.service';
import { SubscriptionsController } from '../subscriptions.controller';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let subscriptionPlansService: jest.Mocked<SubscriptionPlansService>;

  const userId = 'user-uuid-123';
  const planId = 'plan-uuid-111';

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  const mockPlan = {
    id: planId,
    name: 'Premium Plan',
    slug: 'premium',
    prices: [],
  };

  const mockSubscription = {
    id: 'sub-uuid-abc',
    userId,
    planId,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockSubscriptionsService = {
      verifyAndCreateSubscription: jest.fn(),
      getActiveSubscription: jest.fn(),
      getSubscriptionHistory: jest.fn(),
    };

    const mockSubscriptionPlansService = {
      listActivePlans: jest.fn(),
      getPlanById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
        {
          provide: SubscriptionPlansService,
          useValue: mockSubscriptionPlansService,
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    subscriptionsService = module.get(SubscriptionsService);
    subscriptionPlansService = module.get(SubscriptionPlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listPlans', () => {
    it('should retrieve a list of active plans', async () => {
      // Arrange
      subscriptionPlansService.listActivePlans.mockResolvedValue([
        mockPlan,
      ] as any);

      // Act
      const result = await controller.listPlans('US');

      // Assert
      expect(subscriptionPlansService.listActivePlans).toHaveBeenCalledWith(
        'US',
      );
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('getPlan', () => {
    it('should retrieve a single plan by ID', async () => {
      // Arrange
      subscriptionPlansService.getPlanById.mockResolvedValue(mockPlan as any);

      // Act
      const result = await controller.getPlan(planId);

      // Assert
      expect(subscriptionPlansService.getPlanById).toHaveBeenCalledWith(planId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('verifyPurchase', () => {
    it('should call subscriptionsService and return verified subscription', async () => {
      // Arrange
      const dto = {
        storePlatform: StorePlatform.APPLE,
        productId: 'apple-prod-id',
        purchaseToken: 'token-123',
      };
      subscriptionsService.verifyAndCreateSubscription.mockResolvedValue(
        mockSubscription as any,
      );

      // Act
      const result = await controller.verifyPurchase(userId, dto);

      // Assert
      expect(
        subscriptionsService.verifyAndCreateSubscription,
      ).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(mockSubscription);
    });
  });

  describe('getMySubscription', () => {
    it('should return subscription if active exists', async () => {
      // Arrange
      subscriptionsService.getActiveSubscription.mockResolvedValue(
        mockSubscription as any,
      );

      // Act
      const result = await controller.getMySubscription(userId);

      // Assert
      expect(subscriptionsService.getActiveSubscription).toHaveBeenCalledWith(
        userId,
      );
      expect(result).toEqual(mockSubscription);
    });

    it('should throw ActiveSubscriptionNotFoundException if no active subscription exists', async () => {
      // Arrange
      subscriptionsService.getActiveSubscription.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.getMySubscription(userId)).rejects.toThrow(
        new ActiveSubscriptionNotFoundException(),
      );
    });
  });

  describe('getMySubscriptionHistory', () => {
    it('should return historical list of subscriptions', async () => {
      // Arrange
      subscriptionsService.getSubscriptionHistory.mockResolvedValue([
        mockSubscription,
      ] as any);

      // Act
      const result = await controller.getMySubscriptionHistory(userId, {
        page: 1,
        limit: 20,
      });

      // Assert
      expect(subscriptionsService.getSubscriptionHistory).toHaveBeenCalledWith(
        userId,
        1,
        20,
      );
      expect(result).toEqual([mockSubscription]);
    });
  });
});

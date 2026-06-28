import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyCode, SubscriptionPlanStatus } from '@prisma/client';

import { LoggerService } from '@core/logger';

import { SubscriptionPlansService } from '../services/subscription-plans.service';
import { SubscriptionsAdminController } from '../subscriptions-admin.controller';

describe('SubscriptionsAdminController', () => {
  let controller: SubscriptionsAdminController;
  let service: jest.Mocked<SubscriptionPlansService>;

  const planId = 'plan-uuid-111';
  const priceId = 'price-uuid-222';

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

  const mockPrice = {
    id: priceId,
    planId,
    currencyCode: 'USD',
    price: 9.99,
  };

  beforeEach(async () => {
    const mockPlansService = {
      createPlan: jest.fn(),
      listAllPlans: jest.fn(),
      updatePlan: jest.fn(),
      addPlanPrice: jest.fn(),
      removePlanPrice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsAdminController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SubscriptionPlansService, useValue: mockPlansService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<SubscriptionsAdminController>(
      SubscriptionsAdminController,
    );
    service = module.get(SubscriptionPlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPlan', () => {
    it('should create plan and return it', async () => {
      // Arrange
      const dto = {
        name: 'New Tier',
        slug: 'new-tier',
        description: 'Desc',
        appleProductId: 'apple-new',
        googleProductId: 'google-new',
        creditsGranted: 50,
        validityDays: 30,
      };
      service.createPlan.mockResolvedValue(mockPlan as any);

      // Act
      const result = await controller.createPlan(dto);

      // Assert
      expect(service.createPlan).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('listPlans', () => {
    it('should return list of all plans', async () => {
      // Arrange
      service.listAllPlans.mockResolvedValue([mockPlan] as any);

      // Act
      const result = await controller.listPlans();

      // Assert
      expect(service.listAllPlans).toHaveBeenCalled();
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('updatePlan', () => {
    it('should update plan and return updated object', async () => {
      // Arrange
      const dto = {
        name: 'Updated Tier',
        status: SubscriptionPlanStatus.ACTIVE,
      };
      service.updatePlan.mockResolvedValue({
        ...mockPlan,
        name: 'Updated Tier',
      } as any);

      // Act
      const result = await controller.updatePlan(planId, dto);

      // Assert
      expect(service.updatePlan).toHaveBeenCalledWith(planId, dto);
      expect(result.name).toBe('Updated Tier');
    });
  });

  describe('addPlanPrice', () => {
    it('should add a localized price and return it', async () => {
      // Arrange
      const dto = {
        currencyCode: CurrencyCode.EUR,
        price: 8.99,
        countryCode: 'DE',
      };
      service.addPlanPrice.mockResolvedValue(mockPrice as any);

      // Act
      const result = await controller.addPlanPrice(planId, dto);

      // Assert
      expect(service.addPlanPrice).toHaveBeenCalledWith(planId, dto);
      expect(result).toEqual(mockPrice);
    });
  });

  describe('removePlanPrice', () => {
    it('should remove a localized price and return void', async () => {
      // Arrange
      service.removePlanPrice.mockResolvedValue(undefined);

      // Act
      await controller.removePlanPrice(planId, priceId);

      // Assert
      expect(service.removePlanPrice).toHaveBeenCalledWith(planId, priceId);
    });
  });
});

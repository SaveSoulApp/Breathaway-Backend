import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyCode, SubscriptionPlanStatus } from '@prisma/client';

import { LoggerService } from '@core/logger';
import { AdminOidcAuthGuard } from '../../guards/admin-oidc-auth.guard';
import { SubscriptionPlansService } from '@modules/subscriptions/services/subscription-plans.service';

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
    countryCode: 'US',
    currencyCode: CurrencyCode.USD,
    price: 9.99,
  };

  beforeEach(async () => {
    const mockPlansService = {
      createPlan: jest.fn(),
      listAllPlans: jest.fn(),
      updatePlan: jest.fn(),
      addPlanPrice: jest.fn(),
      updatePlanPrice: jest.fn(),
      removePlanPrice: jest.fn(),
      getPriceHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsAdminController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SubscriptionPlansService, useValue: mockPlansService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    })
      .overrideGuard(AdminOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<SubscriptionsAdminController>(
      SubscriptionsAdminController,
    );
    service = module.get(SubscriptionPlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPlan', () => {
    it('should create plan with adminEmail and return it', async () => {
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
      const result = await controller.createPlan(dto, 'admin@example.com');

      // Assert
      expect(service.createPlan).toHaveBeenCalledWith(dto, 'admin@example.com');
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
    it('should update plan with adminEmail and return updated object', async () => {
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
      const result = await controller.updatePlan(
        planId,
        dto,
        'admin@example.com',
      );

      // Assert
      expect(service.updatePlan).toHaveBeenCalledWith(
        planId,
        dto,
        'admin@example.com',
      );
      expect(result.name).toBe('Updated Tier');
    });
  });

  describe('addPlanPrice', () => {
    it('should add a localized price with adminEmail and return it', async () => {
      // Arrange
      const dto = {
        currencyCode: CurrencyCode.EUR,
        originalPrice: 8.99,
        countryCode: 'DE',
      };
      service.addPlanPrice.mockResolvedValue(mockPrice as any);

      // Act
      const result = await controller.addPlanPrice(
        planId,
        dto,
        'admin@example.com',
      );

      // Assert
      expect(service.addPlanPrice).toHaveBeenCalledWith(
        planId,
        dto,
        'admin@example.com',
      );
      expect(result).toEqual(mockPrice);
    });
  });

  describe('updatePlanPrice', () => {
    it('should update a localized price with adminEmail and return updated object', async () => {
      // Arrange
      const dto = {
        originalPrice: 499,
        reason: 'Base price increase',
      };
      const updatedPrice = {
        ...mockPrice,
        originalPrice: 499,
        effectivePrice: 499,
      };
      service.updatePlanPrice.mockResolvedValue(updatedPrice as any);

      // Act
      const result = await controller.updatePlanPrice(
        planId,
        priceId,
        dto,
        'admin@example.com',
      );

      // Assert
      expect(service.updatePlanPrice).toHaveBeenCalledWith(
        planId,
        priceId,
        dto,
        'admin@example.com',
      );
      expect(result).toEqual(updatedPrice);
    });
  });

  describe('removePlanPrice', () => {
    it('should remove a localized price with adminEmail and return void', async () => {
      // Arrange
      service.removePlanPrice.mockResolvedValue(undefined);

      // Act
      await controller.removePlanPrice(planId, priceId, 'admin@example.com');

      // Assert
      expect(service.removePlanPrice).toHaveBeenCalledWith(
        planId,
        priceId,
        'admin@example.com',
      );
    });
  });

  describe('getPriceHistory', () => {
    it('should query price history and return chronological records', async () => {
      // Arrange
      const query = {
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-04-30T23:59:59Z',
      };
      const mockPaginatedHistory = {
        data: [
          {
            id: 'hist-1',
            priceId,
            planId,
            countryCode: 'IN',
            currencyCode: CurrencyCode.INR,
            originalPrice: 399,
            discountedPrice: null,
            effectiveFrom: new Date('2026-01-01T00:00:00Z'),
            effectiveTo: null,
            changeType: 'INITIAL_PRICE',
            changedByUserId: 'system',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        meta: {
          page: 1,
          limit: 100,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };
      service.getPriceHistory.mockResolvedValue(mockPaginatedHistory as any);

      // Act
      const result = await controller.getPriceHistory(planId, query);

      // Assert
      expect(service.getPriceHistory).toHaveBeenCalledWith(planId, query);
      expect(result).toEqual(mockPaginatedHistory);
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StorePlatform, SubscriptionPlanStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';

import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
} from '../dto';
import { SubscriptionPlansService } from '../services/subscription-plans.service';

describe('SubscriptionPlansService', () => {
  let service: SubscriptionPlansService;
  let prisma: MockPrismaService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
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
    status: SubscriptionPlanStatus.ACTIVE,
    prices: [],
  };

  const mockPrice = {
    id: 'price-uuid-222',
    planId: 'plan-uuid-111',
    currencyCode: 'USD',
    price: 9.99,
    countryCode: 'US',
  };

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockClsService = {
      get: jest.fn().mockReturnValue('mock-ip'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionPlansService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<SubscriptionPlansService>(SubscriptionPlansService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listAllPlans', () => {
    it('should list all subscription plans including prices sorted by sortOrder', async () => {
      // Arrange
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listAllPlans();

      // Assert
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        include: { prices: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('listActivePlans', () => {
    it('should list only active subscription plans and all prices when no countryCode is provided', async () => {
      // Arrange
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans();

      // Assert
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        include: { prices: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should filter price entries by countryCode (uppercased) when provided', async () => {
      // Arrange
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans('us');

      // Assert
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        include: {
          prices: { where: { countryCode: 'US' } },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('getPlanById', () => {
    it('should return a plan by ID if found', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);

      // Act
      const result = await service.getPlanById('plan-uuid-111');

      // Assert
      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        include: { prices: true },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw NotFoundException if plan is not found', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getPlanById('non-existent')).rejects.toThrow(
        new NotFoundException(
          'Subscription plan with ID "non-existent" not found',
        ),
      );
    });
  });

  describe('getPlanByStoreProductId', () => {
    it('should query appleProductId when store platform is APPLE', async () => {
      // Arrange
      prisma.subscriptionPlan.findFirst.mockResolvedValue(mockPlan);

      // Act
      const result = await service.getPlanByStoreProductId(
        StorePlatform.APPLE,
        'apple-prod-premium',
      );

      // Assert
      expect(prisma.subscriptionPlan.findFirst).toHaveBeenCalledWith({
        where: { appleProductId: 'apple-prod-premium' },
        include: { prices: true },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should query googleProductId when store platform is GOOGLE', async () => {
      // Arrange
      prisma.subscriptionPlan.findFirst.mockResolvedValue(mockPlan);

      // Act
      const result = await service.getPlanByStoreProductId(
        StorePlatform.GOOGLE,
        'google-prod-premium',
      );

      // Assert
      expect(prisma.subscriptionPlan.findFirst).toHaveBeenCalledWith({
        where: { googleProductId: 'google-prod-premium' },
        include: { prices: true },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw NotFoundException if no plan matches product ID', async () => {
      // Arrange
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getPlanByStoreProductId(StorePlatform.APPLE, 'unknown-prod'),
      ).rejects.toThrow(
        new NotFoundException(
          'Subscription plan not found for APPLE product ID "unknown-prod"',
        ),
      );
    });
  });

  describe('createPlan', () => {
    it('should create subscription plan and emit audit log', async () => {
      // Arrange
      const dto: CreatePlanRequestDto = {
        name: 'New Plan',
        slug: 'new-plan',
        description: 'New Description',
        appleProductId: 'apple-new',
        googleProductId: 'google-new',
        creditsGranted: 50,
        validityDays: 30,
        trialDurationDays: 7,
        sortOrder: 2,
      };

      prisma.subscriptionPlan.create.mockResolvedValue({
        ...mockPlan,
        id: 'new-plan-id',
        name: dto.name,
        slug: dto.slug,
      });

      // Act
      const result = await service.createPlan(dto);

      // Assert
      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          appleProductId: dto.appleProductId,
          googleProductId: dto.googleProductId,
          creditsGranted: dto.creditsGranted,
          validityDays: dto.validityDays,
          trialDurationDays: dto.trialDurationDays,
          sortOrder: dto.sortOrder,
        },
        include: { prices: true },
      });
      expect(result.id).toBe('new-plan-id');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_PLAN_CREATED,
          resourceId: 'new-plan-id',
          userId: 'system',
        }),
      );
    });
  });

  describe('updatePlan', () => {
    it('should update plan, lookup existing plan, and emit audit log', async () => {
      // Arrange
      const dto: UpdatePlanRequestDto = {
        name: 'Updated Plan Name',
        status: SubscriptionPlanStatus.INACTIVE,
      };

      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.subscriptionPlan.update.mockResolvedValue({
        ...mockPlan,
        name: 'Updated Plan Name',
        status: SubscriptionPlanStatus.INACTIVE,
      });

      // Act
      const result = await service.updatePlan('plan-uuid-111', dto);

      // Assert
      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        include: { prices: true },
      });
      expect(prisma.subscriptionPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        data: {
          name: 'Updated Plan Name',
          status: SubscriptionPlanStatus.INACTIVE,
        },
        include: { prices: true },
      });
      expect(result.name).toBe('Updated Plan Name');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AUDIT_LOG_EVENT,
        expect.objectContaining({
          actionType: AuditActionType.SUBSCRIPTION_PLAN_UPDATED,
          resourceId: 'plan-uuid-111',
        }),
      );
    });
  });

  describe('addPlanPrice', () => {
    it('should verify the plan exists and insert a price entry', async () => {
      // Arrange
      const dto: CreatePlanPriceRequestDto = {
        currencyCode: 'EUR',
        price: 8.99,
        countryCode: 'FR',
      };

      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.subscriptionPlanPrice.create.mockResolvedValue({
        ...mockPrice,
        id: 'new-price-id',
        ...dto,
      });

      // Act
      const result = await service.addPlanPrice('plan-uuid-111', dto);

      // Assert
      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        include: { prices: true },
      });
      expect(prisma.subscriptionPlanPrice.create).toHaveBeenCalledWith({
        data: {
          planId: 'plan-uuid-111',
          currencyCode: dto.currencyCode,
          price: dto.price,
          countryCode: dto.countryCode,
        },
      });
      expect(result.id).toBe('new-price-id');
    });
  });

  describe('removePlanPrice', () => {
    it('should find the price entry for plan and delete it', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.subscriptionPlanPrice.findFirst.mockResolvedValue(mockPrice);

      // Act
      await service.removePlanPrice('plan-uuid-111', 'price-uuid-222');

      // Assert
      expect(prisma.subscriptionPlanPrice.findFirst).toHaveBeenCalledWith({
        where: { id: 'price-uuid-222', planId: 'plan-uuid-111' },
      });
      expect(prisma.subscriptionPlanPrice.delete).toHaveBeenCalledWith({
        where: { id: 'price-uuid-222' },
      });
    });

    it('should throw NotFoundException if price entry is not associated with plan', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.subscriptionPlanPrice.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.removePlanPrice('plan-uuid-111', 'invalid-price-id'),
      ).rejects.toThrow(
        new NotFoundException(
          'Price entry "invalid-price-id" not found for plan "plan-uuid-111"',
        ),
      );
      expect(prisma.subscriptionPlanPrice.delete).not.toHaveBeenCalled();
    });
  });
});

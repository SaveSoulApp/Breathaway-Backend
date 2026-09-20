import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { StorePlatform, SubscriptionPlanStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { IpGeolocationService } from '@infrastructure/ip-geolocation';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditActionType } from '@modules/audit/dto';

import {
  SubscriptionPlanNotFoundException,
  SubscriptionPlanPriceNotFoundException,
} from '../application/exceptions';
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
  let configService: jest.Mocked<ConfigService>;
  let ipGeolocationService: { getCountryCodeByIp: jest.Mock };

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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrice = {
    id: 'price-uuid-222',
    planId: 'plan-uuid-111',
    currencyCode: 'USD' as any,
    price: 9.99 as any,
    countryCode: 'US',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockClsService = {
      get: jest.fn().mockReturnValue('mock-ip'),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEFAULT_COUNTRY_CODE') return 'IN';
        return undefined;
      }),
    };

    const mockIpGeolocationService = {
      getCountryCodeByIp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionPlansService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ClsService, useValue: mockClsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: IpGeolocationService, useValue: mockIpGeolocationService },
      ],
    }).compile();

    service = module.get<SubscriptionPlansService>(SubscriptionPlansService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
    configService = module.get(ConfigService);
    ipGeolocationService = module.get(IpGeolocationService);
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('listActivePlans', () => {
    it('should prioritize User.countryCode as first source of truth when userId is authenticated and country exists', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue({ countryCode: 'CA' } as any);
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans(
        'user-123',
        '103.21.244.2',
        'US',
      );

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { countryCode: true },
      });
      // IP lookup should be bypassed because User table has country
      expect(ipGeolocationService.getCountryCodeByIp).not.toHaveBeenCalled();
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['CA', 'IN'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should fall back to IP lookup when authenticated user has null countryCode in User table', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue({ countryCode: null } as any);
      ipGeolocationService.getCountryCodeByIp.mockResolvedValue('GB');
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans('user-123', '81.2.69.142');

      // Assert
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { countryCode: true },
      });
      expect(ipGeolocationService.getCountryCodeByIp).toHaveBeenCalledWith(
        '81.2.69.142',
      );
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['GB', 'IN'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should resolve country from clientIp via ipGeolocationService when unauthenticated (no userId)', async () => {
      // Arrange
      ipGeolocationService.getCountryCodeByIp.mockResolvedValue('GB');
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans(null, '81.2.69.142');

      // Assert
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(ipGeolocationService.getCountryCodeByIp).toHaveBeenCalledWith(
        '81.2.69.142',
      );
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['GB', 'IN'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should fall back to default country code ("IN") when both userId and clientIp are omitted', async () => {
      // Arrange
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans();

      // Assert
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(ipGeolocationService.getCountryCodeByIp).not.toHaveBeenCalled();
      expect(configService.get).toHaveBeenCalledWith('DEFAULT_COUNTRY_CODE');
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['IN'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should fall back to default country code ("IN") when ipGeolocationService returns null', async () => {
      // Arrange
      ipGeolocationService.getCountryCodeByIp.mockResolvedValue(null);
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans(null, '127.0.0.1');

      // Assert
      expect(ipGeolocationService.getCountryCodeByIp).toHaveBeenCalledWith(
        '127.0.0.1',
      );
      expect(configService.get).toHaveBeenCalledWith('DEFAULT_COUNTRY_CODE');
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['IN'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should respect custom DEFAULT_COUNTRY_CODE from config when falling back', async () => {
      // Arrange
      configService.get.mockReturnValue('AE');
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      // Act
      const result = await service.listActivePlans();

      // Assert
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        where: { status: SubscriptionPlanStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            where: { countryCode: { in: ['AE'] } },
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should return detected country price when available, and fallback to default country price when missing', async () => {
      // Arrange
      const usPrice = {
        id: 'p-us',
        currencyCode: 'USD',
        price: 9.99,
        countryCode: 'US',
      };
      const inPrice = {
        id: 'p-in',
        currencyCode: 'INR',
        price: 799,
        countryCode: 'IN',
      };

      const planWithUsAndIn = {
        ...mockPlan,
        id: 'plan-1',
        prices: [usPrice, inPrice],
      };
      const planWithOnlyIn = {
        ...mockPlan,
        id: 'plan-2',
        prices: [inPrice],
      };

      prisma.subscriptionPlan.findMany.mockResolvedValue([
        planWithUsAndIn,
        planWithOnlyIn,
      ] as any);

      // Act
      const result = await service.listActivePlans(null, undefined, 'US');

      // Assert
      expect(result).toHaveLength(2);
      // plan-1 has US price -> returns US price
      expect(result[0].prices).toEqual([usPrice]);
      // plan-2 only has IN price -> falls back to IN default price
      expect(result[1].prices).toEqual([inPrice]);
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw Exception if plan is not found', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getPlanById('non-existent')).rejects.toThrow(
        new SubscriptionPlanNotFoundException(
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw Exception if no plan matches product ID', async () => {
      // Arrange
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getPlanByStoreProductId(StorePlatform.APPLE, 'unknown-prod'),
      ).rejects.toThrow(
        new SubscriptionPlanNotFoundException(
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
      });
      expect(prisma.subscriptionPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        data: {
          name: 'Updated Plan Name',
          status: SubscriptionPlanStatus.INACTIVE,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
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
      } as any);

      // Act
      const result = await service.addPlanPrice('plan-uuid-111', dto);

      // Assert
      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-111' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          appleProductId: true,
          googleProductId: true,
          creditsGranted: true,
          validityDays: true,
          trialDurationDays: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          prices: {
            select: {
              id: true,
              currencyCode: true,
              price: true,
              countryCode: true,
            },
          },
        },
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

    it('should throw Exception if price entry is not associated with plan', async () => {
      // Arrange
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      prisma.subscriptionPlanPrice.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.removePlanPrice('plan-uuid-111', 'invalid-price-id'),
      ).rejects.toThrow(
        new SubscriptionPlanNotFoundException(
          'Price entry "invalid-price-id" not found for plan "plan-uuid-111"',
        ),
      );
      expect(prisma.subscriptionPlanPrice.delete).not.toHaveBeenCalled();
    });
  });
});

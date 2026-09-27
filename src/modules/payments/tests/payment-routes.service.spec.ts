import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { PrismaService } from '@infrastructure/database/prisma.service';

import {
  InvalidAmountRangeException,
  InvalidPriorityStepException,
  InvalidReorderPayloadException,
  RouteAlreadyExistsException,
  RouteNotFoundException,
} from '../application/exceptions';
import { PaymentRoutesService } from '../payment-routes.service';

describe('PaymentRoutesService', () => {
  let service: PaymentRoutesService;
  let prisma: MockPrismaService;

  const mockRoute = {
    id: 'route_01J8VXYZ111',
    countryCode: 'IN',
    gateway: PaymentGateway.RAZORPAY,
    priority: 1,
    enabled: true,
    minAmount: null,
    maxAmount: null,
    createdAt: new Date('2026-09-27T00:00:00Z'),
    updatedAt: new Date('2026-09-27T00:00:00Z'),
  };

  const mockLogger = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      event: jest.fn(),
    }),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRoutesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<PaymentRoutesService>(PaymentRoutesService);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return Promise.all(callback);
    });
  });

  describe('createRoute', () => {
    it('should create a route at step 1 if no routes exist for that country', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayRoute.count.mockResolvedValue(0);
      prisma.paymentGatewayRoute.create.mockResolvedValue(mockRoute);

      // Act
      const result = await service.createRoute({
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
      });

      // Assert
      expect(result).toEqual(mockRoute);
      expect(prisma.paymentGatewayRoute.create).toHaveBeenCalledWith({
        data: {
          countryCode: 'IN',
          gateway: PaymentGateway.RAZORPAY,
          priority: 1,
          enabled: true,
          minAmount: null,
          maxAmount: null,
        },
      });
    });

    it('should shift existing routes when inserting at an existing priority step', async () => {
      // Arrange: 2 routes already exist; inserting at Step 1
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayRoute.count.mockResolvedValue(2);
      prisma.paymentGatewayRoute.updateMany.mockResolvedValue({ count: 2 });
      prisma.paymentGatewayRoute.create.mockResolvedValue({
        ...mockRoute,
        priority: 1,
      });

      // Act
      const result = await service.createRoute({
        countryCode: 'in',
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
      });

      // Assert
      expect(prisma.paymentGatewayRoute.updateMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'IN',
          priority: { gte: 1 },
        },
        data: {
          priority: { increment: 1 },
        },
      });
      expect(result.priority).toBe(1);
    });

    it('should throw RouteAlreadyExistsException if route exists for country and gateway', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(mockRoute);

      // Act & Assert
      await expect(
        service.createRoute({
          countryCode: 'IN',
          gateway: PaymentGateway.RAZORPAY,
        }),
      ).rejects.toThrow(RouteAlreadyExistsException);
    });

    it('should throw InvalidPriorityStepException if requested step is an arbitrary number (e.g. 900)', async () => {
      // Arrange: 2 existing routes; valid steps are 1..3
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayRoute.count.mockResolvedValue(2);

      // Act & Assert
      await expect(
        service.createRoute({
          countryCode: 'IN',
          gateway: PaymentGateway.CASHFREE,
          priority: 900,
        }),
      ).rejects.toThrow(InvalidPriorityStepException);
    });

    it('should throw InvalidAmountRangeException if minAmount > maxAmount', async () => {
      await expect(
        service.createRoute({
          countryCode: 'IN',
          gateway: PaymentGateway.RAZORPAY,
          minAmount: 5000,
          maxAmount: 1000,
        }),
      ).rejects.toThrow(InvalidAmountRangeException);
    });
  });

  describe('listRoutes', () => {
    it('should list all routes sorted by countryCode ASC, priority ASC', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findMany.mockResolvedValue([mockRoute]);

      // Act
      const result = await service.listRoutes({});

      // Assert
      expect(result).toEqual([mockRoute]);
      expect(prisma.paymentGatewayRoute.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ countryCode: 'asc' }, { priority: 'asc' }],
      });
    });

    it('should apply countryCode and enabled filters', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findMany.mockResolvedValue([mockRoute]);

      // Act
      await service.listRoutes({ countryCode: 'IN', enabled: true });

      // Assert
      expect(prisma.paymentGatewayRoute.findMany).toHaveBeenCalledWith({
        where: { countryCode: 'IN', enabled: true },
        orderBy: [{ countryCode: 'asc' }, { priority: 'asc' }],
      });
    });
  });

  describe('getRouteById', () => {
    it('should return route by ID when found', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(mockRoute);

      // Act
      const result = await service.getRouteById('route_01J8VXYZ111');

      // Assert
      expect(result).toEqual(mockRoute);
    });

    it('should throw RouteNotFoundException when route does not exist', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getRouteById('non_existent_id')).rejects.toThrow(
        RouteNotFoundException,
      );
    });
  });

  describe('updateRoute', () => {
    it('should update enabled and amount limits when priority is unchanged', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(mockRoute);
      const updatedMock = { ...mockRoute, enabled: false, minAmount: 500 };
      prisma.paymentGatewayRoute.update.mockResolvedValue(updatedMock);

      // Act
      const result = await service.updateRoute(mockRoute.id, {
        enabled: false,
        minAmount: 500,
      });

      // Assert
      expect(result).toEqual(updatedMock);
      expect(prisma.paymentGatewayRoute.update).toHaveBeenCalledWith({
        where: { id: mockRoute.id },
        data: { enabled: false, minAmount: 500 },
      });
    });

    it('should throw InvalidPriorityStepException if updated priority is out of bounds (e.g. 1000)', async () => {
      // Arrange: 3 routes exist; priority 1000 is invalid
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(mockRoute);
      prisma.paymentGatewayRoute.count.mockResolvedValue(3);

      // Act & Assert
      await expect(
        service.updateRoute(mockRoute.id, { priority: 1000 }),
      ).rejects.toThrow(InvalidPriorityStepException);
    });

    it('should promote route (e.g. from Step 3 to Step 1) and shift intermediate routes down', async () => {
      // Arrange
      const routeAtStep3 = { ...mockRoute, priority: 3 };
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(routeAtStep3);
      prisma.paymentGatewayRoute.count.mockResolvedValue(3);
      prisma.paymentGatewayRoute.updateMany.mockResolvedValue({ count: 2 });
      prisma.paymentGatewayRoute.update.mockResolvedValue({
        ...routeAtStep3,
        priority: 1,
      });

      // Act
      const result = await service.updateRoute(routeAtStep3.id, {
        priority: 1,
      });

      // Assert: routes with priority >= 1 and < 3 must increment by 1
      expect(prisma.paymentGatewayRoute.updateMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'IN',
          priority: { gte: 1, lt: 3 },
          id: { not: routeAtStep3.id },
        },
        data: { priority: { increment: 1 } },
      });
      expect(result.priority).toBe(1);
    });

    it('should demote route (e.g. from Step 1 to Step 3) and shift intermediate routes up', async () => {
      // Arrange
      const routeAtStep1 = { ...mockRoute, priority: 1 };
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(routeAtStep1);
      prisma.paymentGatewayRoute.count.mockResolvedValue(3);
      prisma.paymentGatewayRoute.updateMany.mockResolvedValue({ count: 2 });
      prisma.paymentGatewayRoute.update.mockResolvedValue({
        ...routeAtStep1,
        priority: 3,
      });

      // Act
      const result = await service.updateRoute(routeAtStep1.id, {
        priority: 3,
      });

      // Assert: routes with priority > 1 and <= 3 must decrement by 1
      expect(prisma.paymentGatewayRoute.updateMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'IN',
          priority: { gt: 1, lte: 3 },
          id: { not: routeAtStep1.id },
        },
        data: { priority: { decrement: 1 } },
      });
      expect(result.priority).toBe(3);
    });

    it('should throw InvalidAmountRangeException if new minAmount exceeds existing maxAmount', async () => {
      // Arrange
      const routeWithMax = { ...mockRoute, maxAmount: 2000 };
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(routeWithMax);

      // Act & Assert
      await expect(
        service.updateRoute(mockRoute.id, { minAmount: 3000 }),
      ).rejects.toThrow(InvalidAmountRangeException);
    });
  });

  describe('toggleRoute', () => {
    it('should flip enabled from true to false', async () => {
      // Arrange
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(mockRoute);
      prisma.paymentGatewayRoute.update.mockResolvedValue({
        ...mockRoute,
        enabled: false,
      });

      // Act
      const result = await service.toggleRoute(mockRoute.id);

      // Assert
      expect(result.enabled).toBe(false);
      expect(prisma.paymentGatewayRoute.update).toHaveBeenCalledWith({
        where: { id: mockRoute.id },
        data: { enabled: false },
      });
    });

    it('should throw RouteNotFoundException when toggling non-existent route', async () => {
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);

      await expect(service.toggleRoute('invalid_id')).rejects.toThrow(
        RouteNotFoundException,
      );
    });
  });

  describe('reorderRoutes', () => {
    it('should batch reorder routes assigning steps 1..K in order', async () => {
      // Arrange
      const route1 = { ...mockRoute, id: 'r1', priority: 2 };
      const route2 = { ...mockRoute, id: 'r2', priority: 1 };
      prisma.paymentGatewayRoute.findMany
        .mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }] as any)
        .mockResolvedValueOnce([
          { ...route1, priority: 1 },
          { ...route2, priority: 2 },
        ] as any);

      // Act: reorder so r1 is step 1, r2 is step 2
      const result = await service.reorderRoutes({
        countryCode: 'IN',
        routeIds: ['r1', 'r2'],
      });

      // Assert
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(2);
      expect(prisma.paymentGatewayRoute.update).toHaveBeenCalledTimes(2);
    });

    it('should throw InvalidReorderPayloadException if routeIds length or IDs do not match', async () => {
      // Arrange: DB has 2 routes, payload passes only 1
      prisma.paymentGatewayRoute.findMany.mockResolvedValue([
        { id: 'r1' },
        { id: 'r2' },
      ] as any);

      // Act & Assert
      await expect(
        service.reorderRoutes({
          countryCode: 'IN',
          routeIds: ['r1'],
        }),
      ).rejects.toThrow(InvalidReorderPayloadException);
    });
  });

  describe('deleteRoute', () => {
    it('should delete route and decrement priorities for remaining routes', async () => {
      // Arrange: deleting Step 2 out of 3
      const routeStep2 = { ...mockRoute, id: 'r2', priority: 2 };
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(routeStep2);
      prisma.paymentGatewayRoute.delete.mockResolvedValue(routeStep2);
      prisma.paymentGatewayRoute.updateMany.mockResolvedValue({ count: 1 });

      // Act
      await service.deleteRoute(routeStep2.id);

      // Assert
      expect(prisma.paymentGatewayRoute.delete).toHaveBeenCalledWith({
        where: { id: routeStep2.id },
      });
      expect(prisma.paymentGatewayRoute.updateMany).toHaveBeenCalledWith({
        where: {
          countryCode: 'IN',
          priority: { gt: 2 },
        },
        data: {
          priority: { decrement: 1 },
        },
      });
    });

    it('should throw RouteNotFoundException when deleting non-existent route', async () => {
      prisma.paymentGatewayRoute.findUnique.mockResolvedValue(null);

      await expect(service.deleteRoute('invalid_id')).rejects.toThrow(
        RouteNotFoundException,
      );
    });
  });
});

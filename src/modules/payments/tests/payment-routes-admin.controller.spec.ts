import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGateway } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import {
  CreatePaymentRouteRequestDto,
  ListPaymentRoutesQueryDto,
  PaymentRouteResponseDto,
  ReorderPaymentRoutesRequestDto,
  UpdatePaymentRouteRequestDto,
} from '../dto';
import { PaymentRoutesAdminController } from '../payment-routes-admin.controller';
import { PaymentRoutesService } from '../payment-routes.service';

describe('PaymentRoutesAdminController', () => {
  let controller: PaymentRoutesAdminController;
  let service: jest.Mocked<PaymentRoutesService>;

  const routeId = 'route_01J8VXYZ111';
  const mockRoute: PaymentRouteResponseDto = {
    id: routeId,
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
    }),
  };

  beforeEach(async () => {
    const mockService = {
      createRoute: jest.fn(),
      listRoutes: jest.fn(),
      getRouteById: jest.fn(),
      updateRoute: jest.fn(),
      toggleRoute: jest.fn(),
      reorderRoutes: jest.fn(),
      deleteRoute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentRoutesAdminController],
      providers: [
        { provide: PaymentRoutesService, useValue: mockService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ClsService, useValue: { get: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'ADMIN_USERNAME') return 'admin';
              if (key === 'ADMIN_PASSWORD') return 'secret';
              return '';
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentRoutesAdminController>(
      PaymentRoutesAdminController,
    );
    service = module.get(PaymentRoutesService);
  });

  describe('createRoute', () => {
    it('should delegate to service.createRoute', async () => {
      // Arrange
      const dto: CreatePaymentRouteRequestDto = {
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
        enabled: true,
      };
      service.createRoute.mockResolvedValue(mockRoute);

      // Act
      const result = await controller.createRoute(dto);

      // Assert
      expect(result).toEqual(mockRoute);
      expect(service.createRoute).toHaveBeenCalledWith(dto);
    });
  });

  describe('listRoutes', () => {
    it('should delegate to service.listRoutes with query params', async () => {
      // Arrange
      const query: ListPaymentRoutesQueryDto = {
        countryCode: 'IN',
        enabled: true,
      };
      service.listRoutes.mockResolvedValue([mockRoute]);

      // Act
      const result = await controller.listRoutes(query);

      // Assert
      expect(result).toEqual([mockRoute]);
      expect(service.listRoutes).toHaveBeenCalledWith(query);
    });
  });

  describe('reorderRoutes', () => {
    it('should delegate to service.reorderRoutes', async () => {
      // Arrange
      const dto: ReorderPaymentRoutesRequestDto = {
        countryCode: 'IN',
        routeIds: ['r1', 'r2'],
      };
      service.reorderRoutes.mockResolvedValue([mockRoute]);

      // Act
      const result = await controller.reorderRoutes(dto);

      // Assert
      expect(result).toEqual([mockRoute]);
      expect(service.reorderRoutes).toHaveBeenCalledWith(dto);
    });
  });

  describe('getRouteById', () => {
    it('should delegate to service.getRouteById', async () => {
      // Arrange
      service.getRouteById.mockResolvedValue(mockRoute);

      // Act
      const result = await controller.getRouteById(routeId);

      // Assert
      expect(result).toEqual(mockRoute);
      expect(service.getRouteById).toHaveBeenCalledWith(routeId);
    });
  });

  describe('updateRoute', () => {
    it('should delegate to service.updateRoute', async () => {
      // Arrange
      const dto: UpdatePaymentRouteRequestDto = {
        priority: 2,
        enabled: false,
      };
      service.updateRoute.mockResolvedValue({
        ...mockRoute,
        priority: 2,
        enabled: false,
      });

      // Act
      const result = await controller.updateRoute(routeId, dto);

      // Assert
      expect(result.priority).toBe(2);
      expect(result.enabled).toBe(false);
      expect(service.updateRoute).toHaveBeenCalledWith(routeId, dto);
    });
  });

  describe('toggleRoute', () => {
    it('should delegate to service.toggleRoute', async () => {
      // Arrange
      service.toggleRoute.mockResolvedValue({ ...mockRoute, enabled: false });

      // Act
      const result = await controller.toggleRoute(routeId);

      // Assert
      expect(result.enabled).toBe(false);
      expect(service.toggleRoute).toHaveBeenCalledWith(routeId);
    });
  });

  describe('deleteRoute', () => {
    it('should delegate to service.deleteRoute', async () => {
      // Arrange
      service.deleteRoute.mockResolvedValue(undefined);

      // Act
      await controller.deleteRoute(routeId);

      // Assert
      expect(service.deleteRoute).toHaveBeenCalledWith(routeId);
    });
  });
});

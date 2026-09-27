import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import {
  InvalidAmountRangeException,
  InvalidPriorityStepException,
  InvalidReorderPayloadException,
  RouteAlreadyExistsException,
  RouteNotFoundException,
} from './application/exceptions';
import {
  CreatePaymentRouteRequestDto,
  ListPaymentRoutesQueryDto,
  PaymentRouteResponseDto,
  ReorderPaymentRoutesRequestDto,
  UpdatePaymentRouteRequestDto,
} from './dto';

/**
 * Manages payment gateway routing configurations, availability kill-switches,
 * amount boundaries, and contiguous step-based priority re-ranking.
 *
 * ## Key Priority Invariants
 * - For any given country, priorities are strict, contiguous step numbers: 1, 2, ... N.
 * - Step 1 is the primary preferred gateway tried first by `PaymentsService.selectGateway()`.
 * - Inserting or updating a route to Step K automatically shifts surrounding routes
 *   within an atomic database transaction.
 * - Arbitrary or out-of-bounds numbers (such as 900 or 1000) are rejected with
 *   an `InvalidPriorityStepException`.
 */
@Injectable()
export class PaymentRoutesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Provisions a new payment gateway route for a specific country.
   *
   * @param dto - Route creation payload.
   * @returns The created payment gateway route.
   * @throws {RouteAlreadyExistsException} If a route for [countryCode, gateway] already exists.
   * @throws {InvalidAmountRangeException} If minAmount > maxAmount.
   * @throws {InvalidPriorityStepException} If priority step is out of bounds (> N + 1).
   */
  async createRoute(
    dto: CreatePaymentRouteRequestDto,
  ): Promise<PaymentRouteResponseDto> {
    const countryCode = dto.countryCode.toUpperCase().trim();
    const { gateway } = dto;

    this.validateAmountRange(dto.minAmount, dto.maxAmount);

    const existing = await this.prisma.paymentGatewayRoute.findUnique({
      where: {
        countryCode_gateway: { countryCode, gateway },
      },
    });

    if (existing) {
      throw new RouteAlreadyExistsException(countryCode, gateway);
    }

    const existingCount = await this.prisma.paymentGatewayRoute.count({
      where: { countryCode },
    });

    const targetPriority = dto.priority ?? existingCount + 1;

    if (targetPriority < 1 || targetPriority > existingCount + 1) {
      throw new InvalidPriorityStepException(
        targetPriority,
        1,
        existingCount + 1,
        countryCode,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // If inserting into an existing step position, shift routes >= targetPriority down by 1
      if (targetPriority <= existingCount) {
        await tx.paymentGatewayRoute.updateMany({
          where: {
            countryCode,
            priority: { gte: targetPriority },
          },
          data: {
            priority: { increment: 1 },
          },
        });
      }

      return tx.paymentGatewayRoute.create({
        data: {
          countryCode,
          gateway,
          priority: targetPriority,
          enabled: dto.enabled ?? true,
          minAmount: dto.minAmount ?? null,
          maxAmount: dto.maxAmount ?? null,
        },
      });
    });

    this.logger.event(LOG_EVENT.PAYMENT_ROUTE_CREATED, {
      routeId: created.id,
      countryCode,
      gateway,
      priority: created.priority,
      enabled: created.enabled,
    });

    return created;
  }

  /**
   * Retrieves all payment gateway routes matching optional query filters,
   * sorted by countryCode ASC, priority ASC.
   *
   * @param query - Optional countryCode, enabled, and gateway filters.
   * @returns Array of payment gateway routes.
   */
  async listRoutes(
    query: ListPaymentRoutesQueryDto,
  ): Promise<PaymentRouteResponseDto[]> {
    const where: Prisma.PaymentGatewayRouteWhereInput = {
      ...(query.countryCode
        ? { countryCode: query.countryCode.toUpperCase().trim() }
        : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.gateway ? { gateway: query.gateway } : {}),
    };

    return this.prisma.paymentGatewayRoute.findMany({
      where,
      orderBy: [{ countryCode: 'asc' }, { priority: 'asc' }],
    });
  }

  /**
   * Retrieves a single payment gateway route by its ULID.
   *
   * @param id - Route ULID.
   * @returns The matching payment gateway route.
   * @throws {RouteNotFoundException} If the route does not exist.
   */
  async getRouteById(id: string): Promise<PaymentRouteResponseDto> {
    const route = await this.prisma.paymentGatewayRoute.findUnique({
      where: { id },
    });

    if (!route) {
      throw new RouteNotFoundException(id);
    }

    return route;
  }

  /**
   * Updates an existing payment gateway route's enabled status, amount boundaries,
   * or priority step.
   *
   * @param id - Route ULID.
   * @param dto - Update payload.
   * @returns The updated payment gateway route.
   * @throws {RouteNotFoundException} If the route does not exist.
   * @throws {InvalidAmountRangeException} If minAmount > maxAmount.
   * @throws {InvalidPriorityStepException} If priority step is out of bounds (> N).
   */
  async updateRoute(
    id: string,
    dto: UpdatePaymentRouteRequestDto,
  ): Promise<PaymentRouteResponseDto> {
    const route = await this.prisma.paymentGatewayRoute.findUnique({
      where: { id },
    });

    if (!route) {
      throw new RouteNotFoundException(id);
    }

    const effectiveMin =
      dto.minAmount !== undefined ? dto.minAmount : route.minAmount;
    const effectiveMax =
      dto.maxAmount !== undefined ? dto.maxAmount : route.maxAmount;
    this.validateAmountRange(effectiveMin, effectiveMax);

    const countryCode = route.countryCode;

    // Handle priority step shift if priority is changing
    if (dto.priority !== undefined && dto.priority !== route.priority) {
      const existingCount = await this.prisma.paymentGatewayRoute.count({
        where: { countryCode },
      });

      const targetPriority = dto.priority;
      if (targetPriority < 1 || targetPriority > existingCount) {
        throw new InvalidPriorityStepException(
          targetPriority,
          1,
          existingCount,
          countryCode,
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        if (targetPriority < route.priority) {
          // Moving up in preference (e.g. from Step 3 to Step 1)
          // Increment priorities in [targetPriority, route.priority - 1]
          await tx.paymentGatewayRoute.updateMany({
            where: {
              countryCode,
              priority: { gte: targetPriority, lt: route.priority },
              id: { not: route.id },
            },
            data: {
              priority: { increment: 1 },
            },
          });
        } else {
          // Moving down in preference (e.g. from Step 1 to Step 3)
          // Decrement priorities in [route.priority + 1, targetPriority]
          await tx.paymentGatewayRoute.updateMany({
            where: {
              countryCode,
              priority: { gt: route.priority, lte: targetPriority },
              id: { not: route.id },
            },
            data: {
              priority: { decrement: 1 },
            },
          });
        }

        return tx.paymentGatewayRoute.update({
          where: { id: route.id },
          data: {
            priority: targetPriority,
            ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
            ...(dto.minAmount !== undefined
              ? { minAmount: dto.minAmount }
              : {}),
            ...(dto.maxAmount !== undefined
              ? { maxAmount: dto.maxAmount }
              : {}),
          },
        });
      });

      this.logger.event(LOG_EVENT.PAYMENT_ROUTE_UPDATED, {
        routeId: updated.id,
        countryCode,
        gateway: updated.gateway,
        oldPriority: route.priority,
        newPriority: updated.priority,
        enabled: updated.enabled,
      });

      return updated;
    }

    // Priority is unchanged — execute simple update
    const updated = await this.prisma.paymentGatewayRoute.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.minAmount !== undefined ? { minAmount: dto.minAmount } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount } : {}),
      },
    });

    this.logger.event(LOG_EVENT.PAYMENT_ROUTE_UPDATED, {
      routeId: updated.id,
      countryCode,
      gateway: updated.gateway,
      priority: updated.priority,
      enabled: updated.enabled,
    });

    return updated;
  }

  /**
   * Toggles the enabled state of a payment gateway route (circuit breaker).
   *
   * @param id - Route ULID.
   * @returns The updated payment gateway route.
   * @throws {RouteNotFoundException} If the route does not exist.
   */
  async toggleRoute(id: string): Promise<PaymentRouteResponseDto> {
    const route = await this.prisma.paymentGatewayRoute.findUnique({
      where: { id },
    });

    if (!route) {
      throw new RouteNotFoundException(id);
    }

    const updated = await this.prisma.paymentGatewayRoute.update({
      where: { id },
      data: { enabled: !route.enabled },
    });

    this.logger.event(LOG_EVENT.PAYMENT_ROUTE_TOGGLED, {
      routeId: id,
      countryCode: route.countryCode,
      gateway: route.gateway,
      enabled: updated.enabled,
    });

    return updated;
  }

  /**
   * Atomically reorders all priority steps for a specific country using an
   * ordered list of route IDs.
   *
   * @param dto - Country and ordered route ID array (index 0 = step 1).
   * @returns The newly ordered list of routes for the country.
   * @throws {InvalidReorderPayloadException} If routeIds does not match the exact set of routes for the country.
   */
  async reorderRoutes(
    dto: ReorderPaymentRoutesRequestDto,
  ): Promise<PaymentRouteResponseDto[]> {
    const countryCode = dto.countryCode.toUpperCase().trim();
    const existingRoutes = await this.prisma.paymentGatewayRoute.findMany({
      where: { countryCode },
      select: { id: true },
    });

    const existingIds = new Set(existingRoutes.map((r) => r.id));

    if (
      dto.routeIds.length !== existingRoutes.length ||
      new Set(dto.routeIds).size !== existingRoutes.length ||
      !dto.routeIds.every((id) => existingIds.has(id))
    ) {
      throw new InvalidReorderPayloadException(
        `The routeIds array must contain all ${existingRoutes.length} route IDs for country '${countryCode}' without omissions or duplicates.`,
      );
    }

    await this.prisma.$transaction(
      dto.routeIds.map((id, index) =>
        this.prisma.paymentGatewayRoute.update({
          where: { id },
          data: { priority: index + 1 },
        }),
      ),
    );

    this.logger.event(LOG_EVENT.PAYMENT_ROUTE_REORDERED, {
      countryCode,
      routeOrder: dto.routeIds,
    });

    return this.prisma.paymentGatewayRoute.findMany({
      where: { countryCode },
      orderBy: { priority: 'asc' },
    });
  }

  /**
   * Deletes a payment gateway route and atomically decrements priority steps
   * for remaining routes in that country to maintain a contiguous sequence.
   *
   * @param id - Route ULID.
   * @throws {RouteNotFoundException} If the route does not exist.
   */
  async deleteRoute(id: string): Promise<void> {
    const route = await this.prisma.paymentGatewayRoute.findUnique({
      where: { id },
    });

    if (!route) {
      throw new RouteNotFoundException(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentGatewayRoute.delete({ where: { id } });

      await tx.paymentGatewayRoute.updateMany({
        where: {
          countryCode: route.countryCode,
          priority: { gt: route.priority },
        },
        data: {
          priority: { decrement: 1 },
        },
      });
    });

    this.logger.event(LOG_EVENT.PAYMENT_ROUTE_DELETED, {
      routeId: id,
      countryCode: route.countryCode,
      gateway: route.gateway,
      deletedPriority: route.priority,
    });
  }

  private validateAmountRange(
    minAmount?: number | null,
    maxAmount?: number | null,
  ): void {
    if (
      minAmount !== undefined &&
      minAmount !== null &&
      maxAmount !== undefined &&
      maxAmount !== null &&
      minAmount > maxAmount
    ) {
      throw new InvalidAmountRangeException(minAmount, maxAmount);
    }
  }
}

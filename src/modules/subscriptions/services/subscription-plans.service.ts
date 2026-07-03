import { Injectable } from '@nestjs/common';
import { SubscriptionPlanNotFoundException } from '../application/exceptions';
import { StorePlatform, SubscriptionPlanStatus } from '@prisma/client';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
} from '../dto';

/**
 * Manages the lifecycle and querying of subscription plans and their localized pricing.
 *
 * Supports creating new tiers, updating existing plan properties, and managing
 * the varying prices across different currency and country combinations.
 */
@Injectable()
export class SubscriptionPlansService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  /**
   * Retrieves all subscription plans in the system, both active and inactive.
   *
   * @returns All plans sorted by their defined sort order, with all localized prices.
   */
  async listAllPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      include: {
        prices: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return plans;
  }

  /**
   * Retrieves all subscription plans that are currently available for purchase.
   *
   * @param countryCode - Optional ISO country code to filter the associated prices.
   * @returns Active plans sorted by their defined sort order.
   */
  async listActivePlans(countryCode?: string) {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { status: SubscriptionPlanStatus.ACTIVE },
      include: {
        prices: countryCode
          ? { where: { countryCode: countryCode.toUpperCase() } }
          : true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return plans;
  }

  /**
   * Fetches a single subscription plan by its internal UUID.
   *
   * @param id - Internal UUID of the plan.
   * @returns The requested plan along with all its configured prices.
   * @throws {SubscriptionPlanNotFoundException} When no plan is found.
   */
  async getPlanById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { prices: true },
    });

    if (!plan) {
      this.logger.warn('Get plan failed: plan not found', { planId: id });
      throw new SubscriptionPlanNotFoundException(
        `Subscription plan with ID "${id}" not found`,
      );
    }

    return plan;
  }

  /**
   * Resolves a subscription plan using the store-specific product ID.
   *
   * Used heavily during purchase verification and webhook handling to map an Apple
   * or Google product identifier back to our internal business tier.
   *
   * @param platform - The storefront (APPLE or GOOGLE).
   * @param productId - The product ID registered in the respective storefront.
   * @returns The internal plan mapped to this product.
   * @throws {SubscriptionPlanNotFoundException} When no plan is configured for the given product ID.
   */
  async getPlanByStoreProductId(platform: StorePlatform, productId: string) {
    const where =
      platform === StorePlatform.APPLE
        ? { appleProductId: productId }
        : { googleProductId: productId };

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where,
      include: { prices: true },
    });

    if (!plan) {
      this.logger.warn('Get plan by product ID failed: plan not found', { platform, productId });
      throw new SubscriptionPlanNotFoundException(
        `Subscription plan not found for ${platform} product ID "${productId}"`,
      );
    }

    return plan;
  }

  /**
   * Provisions a new subscription tier in the system.
   *
   * Automatically logs an audit event for traceability.
   *
   * @param dto - Configuration for the new plan including credits and validity.
   * @returns The newly created plan.
   */
  async createPlan(dto: CreatePlanRequestDto) {
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        appleProductId: dto.appleProductId,
        googleProductId: dto.googleProductId,
        creditsGranted: dto.creditsGranted,
        validityDays: dto.validityDays,
        trialDurationDays: dto.trialDurationDays ?? 0,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { prices: true },
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_CREATED,
      userId: 'system',
      resourceId: plan.id,
      metadata: { planName: plan.name, slug: plan.slug },
    });

    return plan;
  }

  /**
   * Modifies an existing subscription tier.
   *
   * Does not cascade changes to active subscriptions (e.g., changing credits granted
   * only affects future renewals or purchases). Logs an audit event.
   *
   * @param id - Internal UUID of the plan to modify.
   * @param dto - Partial payload of fields to update.
   * @returns The updated plan.
   * @throws {SubscriptionPlanNotFoundException} When the target plan does not exist.
   */
  async updatePlan(id: string, dto: UpdatePlanRequestDto) {
    await this.getPlanById(id);

    const plan = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.appleProductId !== undefined && {
          appleProductId: dto.appleProductId,
        }),
        ...(dto.googleProductId !== undefined && {
          googleProductId: dto.googleProductId,
        }),
        ...(dto.creditsGranted !== undefined && {
          creditsGranted: dto.creditsGranted,
        }),
        ...(dto.validityDays !== undefined && {
          validityDays: dto.validityDays,
        }),
        ...(dto.trialDurationDays !== undefined && {
          trialDurationDays: dto.trialDurationDays,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { prices: true },
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_UPDATED,
      userId: 'system',
      resourceId: plan.id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return plan;
  }

  /**
   * Attaches a new localized price to an existing subscription plan.
   *
   * @param planId - UUID of the target plan.
   * @param dto - Currency, country, and price amount.
   * @returns The newly created price record.
   * @throws {SubscriptionPlanNotFoundException} When the target plan does not exist.
   */
  async addPlanPrice(planId: string, dto: CreatePlanPriceRequestDto) {
    await this.getPlanById(planId);

    const price = await this.prisma.subscriptionPlanPrice.create({
      data: {
        planId,
        currencyCode: dto.currencyCode,
        price: dto.price,
        countryCode: dto.countryCode,
      },
    });

    return price;
  }

  /**
   * Detaches a localized price from a subscription plan.
   *
   * @param planId - UUID of the target plan.
   * @param priceId - UUID of the price record to remove.
   * @throws {SubscriptionPlanNotFoundException} When the plan or price record does not exist.
   */
  async removePlanPrice(planId: string, priceId: string) {
    await this.getPlanById(planId);

    const price = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!price) {
      this.logger.warn('Remove plan price failed: price not found', { planId, priceId });
      throw new SubscriptionPlanNotFoundException(
        `Price entry "${priceId}" not found for plan "${planId}"`,
      );
    }

    await this.prisma.subscriptionPlanPrice.delete({
      where: { id: priceId },
    });
  }
}

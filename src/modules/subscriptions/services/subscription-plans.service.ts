import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CurrencyCode,
  Prisma,
  StorePlatform,
  SubscriptionPlanStatus,
  SubscriptionPriceChangeType,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IpGeolocationService } from '@infrastructure/ip-geolocation';
import { AuditActionType } from '@modules/audit/dto';

import {
  InvalidPlanPriceException,
  InvalidSubscriptionDatesException,
  SubscriptionPlanNotFoundException,
  SubscriptionPlanPriceNotFoundException,
} from '../application/exceptions';
import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  QueryPriceHistoryRequestDto,
  UpdatePlanPriceRequestDto,
  UpdatePlanRequestDto,
} from '../dto';

const PLAN_PRICE_SELECT = {
  id: true,
  currencyCode: true,
  countryCode: true,
  originalPrice: true,
  discountedPrice: true,
  discountStartsAt: true,
  discountEndsAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function formatPriceForDisplay(
  price: {
    id: string;
    currencyCode: CurrencyCode;
    countryCode: string;
    originalPrice: Prisma.Decimal | number;
    discountedPrice?: Prisma.Decimal | number | null;
    discountStartsAt?: Date | null;
    discountEndsAt?: Date | null;
  },
  now = new Date(),
) {
  const isDiscountActive = Boolean(
    price.discountedPrice !== null &&
    price.discountedPrice !== undefined &&
    price.discountStartsAt &&
    price.discountEndsAt &&
    now >= new Date(price.discountStartsAt) &&
    now <= new Date(price.discountEndsAt),
  );

  const originalPrice = Number(price.originalPrice);
  const effectivePrice = isDiscountActive
    ? Number(price.discountedPrice)
    : originalPrice;

  let discountPercentage: number | undefined;
  let savingsAmount: number | undefined;

  if (isDiscountActive && originalPrice > effectivePrice) {
    savingsAmount = Math.round((originalPrice - effectivePrice) * 100) / 100;
    discountPercentage = Math.round(
      ((originalPrice - effectivePrice) / originalPrice) * 100,
    );
  }

  return {
    id: price.id,
    currencyCode: price.currencyCode,
    countryCode: price.countryCode,
    originalPrice,
    discountedPrice:
      price.discountedPrice !== null && price.discountedPrice !== undefined
        ? Number(price.discountedPrice)
        : null,
    effectivePrice,
    price: effectivePrice,
    isDiscountActive,
    discountPercentage,
    savingsAmount,
    discountStartsAt: price.discountStartsAt ?? null,
    discountEndsAt: price.discountEndsAt ?? null,
  };
}

/**
 * Manages the lifecycle and querying of subscription plans and their localized pricing.
 *
 * Supports creating new tiers, updating existing plan properties, and managing
 * varying prices across different currency and country combinations with temporal audit history.
 */
@Injectable()
export class SubscriptionPlansService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ipGeolocationService: IpGeolocationService,
    private readonly clsService?: ClsService,
  ) {
    super(logger);
  }

  private resolveActorUserId(providedUserId?: string): string {
    if (providedUserId && providedUserId !== 'system') {
      return providedUserId;
    }
    const clsAdminEmail = this.clsService?.get<string>('adminEmail');
    if (clsAdminEmail) {
      return clsAdminEmail;
    }
    return providedUserId || 'system';
  }

  /**
   * Retrieves all subscription plans in the system, both active and inactive.
   *
   * @returns All plans sorted by their defined sort order, with all localized prices.
   */
  async listAllPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
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
          select: PLAN_PRICE_SELECT,
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const now = new Date();
    return plans.map((plan) => ({
      ...plan,
      prices: plan.prices.map((p) => formatPriceForDisplay(p, now)),
    }));
  }

  /**
   * Retrieves all subscription plans that are currently available for purchase,
   * with prices localized to the caller's geographic region.
   *
   * Country code resolution hierarchy:
   * 1. Authenticated user's profile countryCode from User table.
   * 2. Explicit query parameter `countryCode` if provided.
   * 3. Country resolved from client public IP address via IPinfo Lite.
   * 4. Config default `DEFAULT_COUNTRY_CODE` (defaults to 'IN').
   */
  async listActivePlans(
    userId?: string | null,
    clientIp?: string,
    countryCode?: string,
  ) {
    let resolvedCountryCode: string | undefined;

    // 1. First source of truth: authenticated user's country code in User table
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { countryCode: true },
      });
      if (user?.countryCode) {
        resolvedCountryCode = user.countryCode.trim().toUpperCase();
      }
    }

    // Explicit query parameter override (if user has no set profile country)
    if (!resolvedCountryCode && countryCode) {
      resolvedCountryCode = countryCode.trim().toUpperCase();
    }

    // 2. Second source of truth: client public IP lookup via IPinfo Lite
    if (!resolvedCountryCode && clientIp) {
      const detectedCountry =
        await this.ipGeolocationService.getCountryCodeByIp(clientIp);
      if (detectedCountry) {
        resolvedCountryCode = detectedCountry.trim().toUpperCase();
      }
    }

    // 3. Fallback: server default country code ('IN')
    const defaultCountryCode = (
      this.configService.get<string>('DEFAULT_COUNTRY_CODE') ?? 'IN'
    ).toUpperCase();

    if (!resolvedCountryCode) {
      resolvedCountryCode = defaultCountryCode;
    }

    const targetCountries =
      resolvedCountryCode === defaultCountryCode
        ? [defaultCountryCode]
        : [resolvedCountryCode, defaultCountryCode];

    const plans = await this.prisma.subscriptionPlan.findMany({
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
          where: { countryCode: { in: targetCountries } },
          select: PLAN_PRICE_SELECT,
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const now = new Date();
    return plans.map((plan) => {
      const resolvedPrices = plan.prices.filter(
        (price) => price.countryCode === resolvedCountryCode,
      );

      const rawActivePrices =
        resolvedPrices.length > 0
          ? resolvedPrices
          : plan.prices.filter(
              (price) => price.countryCode === defaultCountryCode,
            );

      return {
        ...plan,
        prices: rawActivePrices.map((p) => formatPriceForDisplay(p, now)),
      };
    });
  }

  /**
   * Fetches a single subscription plan by its internal UUID.
   */
  async getPlanById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
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
          select: PLAN_PRICE_SELECT,
        },
      },
    });

    if (!plan) {
      this.logger.warn('Get plan failed: plan not found', {
        planId: id,
        step: 'fetch',
      });
      throw new SubscriptionPlanNotFoundException(
        `Subscription plan with ID "${id}" not found`,
      );
    }

    const now = new Date();
    return {
      ...plan,
      prices: plan.prices.map((p) => formatPriceForDisplay(p, now)),
    };
  }

  /**
   * Resolves a subscription plan using the store-specific product ID.
   */
  async getPlanByStoreProductId(platform: StorePlatform, productId: string) {
    const where =
      platform === StorePlatform.APPLE
        ? { appleProductId: productId }
        : { googleProductId: productId };

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where,
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
          select: PLAN_PRICE_SELECT,
        },
      },
    });

    if (!plan) {
      this.logger.warn('Get plan by product ID failed: plan not found', {
        platform,
        productId,
        step: 'fetch_by_store_id',
      });
      throw new SubscriptionPlanNotFoundException(
        `Subscription plan not found for ${platform} product ID "${productId}"`,
      );
    }

    const now = new Date();
    return {
      ...plan,
      prices: plan.prices.map((p) => formatPriceForDisplay(p, now)),
    };
  }

  /**
   * Resolves a plan from a store product ID without knowing which storefront it came from.
   */
  async getPlanByProductId(productId: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ appleProductId: productId }, { googleProductId: productId }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        appleProductId: true,
        googleProductId: true,
        creditsGranted: true,
        validityDays: true,
        status: true,
      },
    });

    if (!plan) {
      this.logger.warn('Get plan by product ID failed: plan not found', {
        productId,
        step: 'fetch_by_product_id',
      });
      throw new SubscriptionPlanNotFoundException(
        `Subscription plan not found for product ID "${productId}"`,
      );
    }

    return plan;
  }

  /**
   * Provisions a new subscription tier in the system.
   */
  async createPlan(dto: CreatePlanRequestDto) {
    let plan;
    try {
      plan = await this.prisma.subscriptionPlan.create({
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
            select: PLAN_PRICE_SELECT,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to create subscription plan', {
        name: dto.name,
        step: 'persist_create',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Subscription plan created successfully', {
      planId: plan.id,
      step: 'complete',
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_CREATED,
      userId: 'system',
      resourceId: plan.id,
      metadata: { planName: plan.name, slug: plan.slug },
    });

    const now = new Date();
    return {
      ...plan,
      prices: plan.prices.map((p) => formatPriceForDisplay(p, now)),
    };
  }

  /**
   * Modifies an existing subscription tier.
   */
  async updatePlan(id: string, dto: UpdatePlanRequestDto) {
    await this.getPlanById(id);

    let plan;
    try {
      plan = await this.prisma.subscriptionPlan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
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
            select: PLAN_PRICE_SELECT,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to update subscription plan', {
        planId: id,
        step: 'persist_update',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Subscription plan updated successfully', {
      planId: plan.id,
      step: 'complete',
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_UPDATED,
      userId: 'system',
      resourceId: plan.id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    const now = new Date();
    return {
      ...plan,
      prices: plan.prices.map((p) => formatPriceForDisplay(p, now)),
    };
  }

  /**
   * Attaches a new localized price to an existing subscription plan and establishes
   * its initial temporal audit record.
   */
  async addPlanPrice(
    planId: string,
    dto: CreatePlanPriceRequestDto,
    changedByUserId = 'system',
  ) {
    await this.getPlanById(planId);
    const actorUserId = this.resolveActorUserId(changedByUserId);

    const originalPrice = dto.originalPrice;
    if (!originalPrice || originalPrice <= 0) {
      throw new InvalidPlanPriceException(
        'originalPrice must be greater than 0',
      );
    }

    let discountedPrice: number | null = null;
    let discountStartsAt: Date | null = null;
    let discountEndsAt: Date | null = null;

    if (dto.discountedPrice !== undefined && dto.discountedPrice !== null) {
      discountedPrice = dto.discountedPrice;
      if (discountedPrice <= 0 || discountedPrice >= originalPrice) {
        throw new InvalidPlanPriceException(
          'discountedPrice must be greater than 0 and less than originalPrice',
        );
      }
      if (!dto.discountStartsAt || !dto.discountEndsAt) {
        throw new InvalidPlanPriceException(
          'Both discountStartsAt and discountEndsAt are required when setting a discountedPrice',
        );
      }
      discountStartsAt = new Date(dto.discountStartsAt);
      discountEndsAt = new Date(dto.discountEndsAt);
      if (discountStartsAt >= discountEndsAt) {
        throw new InvalidPlanPriceException(
          'discountStartsAt must be before discountEndsAt',
        );
      }
    }

    const now = new Date();
    let price;
    try {
      price = await this.prisma.$transaction(async (tx) => {
        const createdPrice = await tx.subscriptionPlanPrice.create({
          data: {
            planId,
            currencyCode: dto.currencyCode,
            countryCode: dto.countryCode,
            originalPrice,
            discountedPrice,
            discountStartsAt,
            discountEndsAt,
          },
        });

        await tx.subscriptionPlanPriceHistory.create({
          data: {
            priceId: createdPrice.id,
            planId,
            countryCode: dto.countryCode,
            currencyCode: dto.currencyCode,
            originalPrice,
            discountedPrice,
            discountStartsAt,
            discountEndsAt,
            effectiveFrom: now,
            effectiveTo: null,
            changeType: SubscriptionPriceChangeType.INITIAL_PRICE,
            changedByUserId: actorUserId,
            changeReason: dto.reason ?? 'Initial price creation',
          },
        });

        return createdPrice;
      });
    } catch (error) {
      this.logger.error('Failed to add plan price', {
        planId,
        currencyCode: dto.currencyCode,
        step: 'persist_add_price',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Plan price added successfully', {
      planId,
      priceId: price.id,
      step: 'complete',
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_PRICE_CREATED,
      userId: actorUserId,
      resourceId: price.id,
      metadata: {
        planId,
        countryCode: dto.countryCode,
        currencyCode: dto.currencyCode,
        originalPrice,
        discountedPrice,
        reason: dto.reason,
      },
    });

    return formatPriceForDisplay(price, now);
  }

  /**
   * Modifies an existing localized price configuration (e.g. Base Price hike or promotional discount),
   * closing the previous temporal interval and establishing a new audit trail record.
   */
  async updatePlanPrice(
    planId: string,
    priceId: string,
    dto: UpdatePlanPriceRequestDto,
    changedByUserId = 'system',
  ) {
    await this.getPlanById(planId);
    const actorUserId = this.resolveActorUserId(changedByUserId);

    const existingPrice = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!existingPrice) {
      this.logger.warn('Update plan price failed: price not found', {
        planId,
        priceId,
        step: 'fetch_price',
      });
      throw new SubscriptionPlanPriceNotFoundException(
        `Price entry "${priceId}" not found for plan "${planId}"`,
      );
    }

    const newOriginalPrice =
      dto.originalPrice !== undefined
        ? dto.originalPrice
        : Number(existingPrice.originalPrice);

    if (newOriginalPrice <= 0) {
      throw new InvalidPlanPriceException(
        'originalPrice must be greater than 0',
      );
    }

    const newDiscountedPrice: number | null =
      dto.discountedPrice !== undefined
        ? dto.discountedPrice
        : existingPrice.discountedPrice
          ? Number(existingPrice.discountedPrice)
          : null;

    let newDiscountStartsAt: Date | null =
      dto.discountStartsAt !== undefined
        ? dto.discountStartsAt
          ? new Date(dto.discountStartsAt)
          : null
        : existingPrice.discountStartsAt;

    let newDiscountEndsAt: Date | null =
      dto.discountEndsAt !== undefined
        ? dto.discountEndsAt
          ? new Date(dto.discountEndsAt)
          : null
        : existingPrice.discountEndsAt;

    if (newDiscountedPrice !== null) {
      if (newDiscountedPrice <= 0 || newDiscountedPrice >= newOriginalPrice) {
        throw new InvalidPlanPriceException(
          'discountedPrice must be greater than 0 and less than originalPrice',
        );
      }
      if (!newDiscountStartsAt || !newDiscountEndsAt) {
        throw new InvalidPlanPriceException(
          'Both discountStartsAt and discountEndsAt are required when setting a discountedPrice',
        );
      }
      if (newDiscountStartsAt >= newDiscountEndsAt) {
        throw new InvalidPlanPriceException(
          'discountStartsAt must be before discountEndsAt',
        );
      }
    } else {
      newDiscountStartsAt = null;
      newDiscountEndsAt = null;
    }

    // Determine changeType
    let changeType: SubscriptionPriceChangeType =
      SubscriptionPriceChangeType.PRICE_UPDATED;
    if (
      dto.originalPrice !== undefined &&
      dto.originalPrice > Number(existingPrice.originalPrice)
    ) {
      changeType = SubscriptionPriceChangeType.BASE_PRICE_INCREASE;
    } else if (
      dto.originalPrice !== undefined &&
      dto.originalPrice < Number(existingPrice.originalPrice)
    ) {
      changeType = SubscriptionPriceChangeType.BASE_PRICE_DECREASE;
    } else if (
      dto.discountedPrice !== undefined &&
      dto.discountedPrice !== null &&
      !existingPrice.discountedPrice
    ) {
      changeType = SubscriptionPriceChangeType.PROMO_SCHEDULED;
    } else if (
      dto.discountedPrice === null &&
      existingPrice.discountedPrice !== null
    ) {
      changeType = SubscriptionPriceChangeType.PROMO_ENDED;
    } else if (
      dto.discountedPrice !== undefined ||
      dto.discountStartsAt !== undefined ||
      dto.discountEndsAt !== undefined
    ) {
      changeType = SubscriptionPriceChangeType.PROMO_UPDATED;
    }

    const now = new Date();
    let updatedPrice;
    try {
      updatedPrice = await this.prisma.$transaction(async (tx) => {
        // Close prior open interval in history
        await tx.subscriptionPlanPriceHistory.updateMany({
          where: { priceId, effectiveTo: null },
          data: { effectiveTo: now },
        });

        // Update current price row
        const price = await tx.subscriptionPlanPrice.update({
          where: { id: priceId },
          data: {
            originalPrice: newOriginalPrice,
            discountedPrice: newDiscountedPrice,
            discountStartsAt: newDiscountStartsAt,
            discountEndsAt: newDiscountEndsAt,
          },
        });

        // Insert new interval into history
        await tx.subscriptionPlanPriceHistory.create({
          data: {
            priceId,
            planId,
            countryCode: existingPrice.countryCode,
            currencyCode: existingPrice.currencyCode,
            originalPrice: newOriginalPrice,
            discountedPrice: newDiscountedPrice,
            discountStartsAt: newDiscountStartsAt,
            discountEndsAt: newDiscountEndsAt,
            effectiveFrom: now,
            effectiveTo: null,
            changeType,
            changedByUserId: actorUserId,
            changeReason: dto.reason ?? null,
          },
        });

        return price;
      });
    } catch (error) {
      this.logger.error('Failed to update plan price', {
        planId,
        priceId,
        step: 'persist_update_price',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Plan price updated successfully', {
      planId,
      priceId,
      changeType,
      step: 'complete',
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_PRICE_UPDATED,
      userId: actorUserId,
      resourceId: priceId,
      metadata: {
        planId,
        changeType,
        previousOriginalPrice: Number(existingPrice.originalPrice),
        newOriginalPrice,
        previousDiscountedPrice: existingPrice.discountedPrice
          ? Number(existingPrice.discountedPrice)
          : null,
        newDiscountedPrice,
        reason: dto.reason,
      },
    });

    return formatPriceForDisplay(updatedPrice, now);
  }

  /**
   * Detaches a localized price from a subscription plan and closes its active audit interval.
   */
  async removePlanPrice(
    planId: string,
    priceId: string,
    changedByUserId = 'system',
  ) {
    await this.getPlanById(planId);
    const actorUserId = this.resolveActorUserId(changedByUserId);

    const price = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!price) {
      this.logger.warn('Remove plan price failed: price not found', {
        planId,
        priceId,
        step: 'remove_price',
      });
      throw new SubscriptionPlanPriceNotFoundException(
        `Price entry "${priceId}" not found for plan "${planId}"`,
      );
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionPlanPriceHistory.updateMany({
          where: { priceId, effectiveTo: null },
          data: { effectiveTo: now },
        });

        await tx.subscriptionPlanPriceHistory.create({
          data: {
            priceId: null,
            planId,
            countryCode: price.countryCode,
            currencyCode: price.currencyCode,
            originalPrice: price.originalPrice,
            discountedPrice: price.discountedPrice,
            discountStartsAt: price.discountStartsAt,
            discountEndsAt: price.discountEndsAt,
            effectiveFrom: now,
            effectiveTo: now,
            changeType: SubscriptionPriceChangeType.PRICE_DELETED,
            changedByUserId: actorUserId,
            changeReason: 'Price configuration deleted',
          },
        });

        await tx.subscriptionPlanPrice.delete({
          where: { id: priceId },
        });
      });
    } catch (error) {
      this.logger.error('Failed to remove plan price', {
        planId,
        priceId,
        step: 'persist_remove_price',
        err: serializeError(error),
      });
      throw error;
    }

    this.logger.log('Plan price removed successfully', {
      planId,
      priceId,
      step: 'complete',
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_PLAN_PRICE_DELETED,
      userId: actorUserId,
      resourceId: priceId,
      metadata: {
        planId,
        countryCode: price.countryCode,
        currencyCode: price.currencyCode,
      },
    });
  }

  /**
   * Queries temporal price history across any date range or for a specific point in time.
   */
  async getPriceHistory(planId: string, query: QueryPriceHistoryRequestDto) {
    await this.getPlanById(planId);

    if (query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      const end = new Date(query.endDate);
      if (start > end) {
        throw new InvalidSubscriptionDatesException(
          'startDate must be on or before endDate',
        );
      }
    }

    const where: Prisma.SubscriptionPlanPriceHistoryWhereInput = {
      planId,
      ...(query.countryCode && { countryCode: query.countryCode }),
    };

    if (query.pointInTime) {
      const pit = new Date(query.pointInTime);
      where.effectiveFrom = { lte: pit };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gt: pit } }];
    } else if (query.startDate || query.endDate) {
      if (query.startDate && query.endDate) {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);
        where.effectiveFrom = { lte: end };
        where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: start } }];
      } else if (query.startDate) {
        const start = new Date(query.startDate);
        where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: start } }];
      } else if (query.endDate) {
        const end = new Date(query.endDate);
        where.effectiveFrom = { lte: end };
      }
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 100));
    const skip = (page - 1) * limit;

    const history = await this.prisma.subscriptionPlanPriceHistory.findMany({
      where,
      orderBy: { effectiveFrom: 'asc' },
      skip,
      take: limit,
    });

    return history.map((h) => ({
      ...h,
      originalPrice: Number(h.originalPrice),
      discountedPrice: h.discountedPrice ? Number(h.discountedPrice) : null,
    }));
  }
}

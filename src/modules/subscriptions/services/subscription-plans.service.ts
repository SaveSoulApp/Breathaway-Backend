import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { StorePlatform, SubscriptionPlanStatus } from '@prisma/client';
import {
  CreatePlanPriceRequestDto,
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
} from '../dto';

@Injectable()
export class SubscriptionPlansService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

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

  async getPlanById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { prices: true },
    });

    if (!plan) {
      throw new NotFoundException(
        `Subscription plan with ID "${id}" not found`,
      );
    }

    return plan;
  }

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
      throw new NotFoundException(
        `Subscription plan not found for ${platform} product ID "${productId}"`,
      );
    }

    return plan;
  }

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

  async removePlanPrice(planId: string, priceId: string) {
    await this.getPlanById(planId);

    const price = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!price) {
      throw new NotFoundException(
        `Price entry "${priceId}" not found for plan "${planId}"`,
      );
    }

    await this.prisma.subscriptionPlanPrice.delete({
      where: { id: priceId },
    });
  }
}

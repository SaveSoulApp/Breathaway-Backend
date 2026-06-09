import { DateUtil } from '@common/utils/date.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditActionType } from '@modules/audit/dto/audit-event.dto';
import { CreditsService } from '@modules/credits/credits.service';
import {
  CreditSource,
  CurrencyCode,
  Prisma,
  StorePlatform,
  SubscriptionEventType,
  SubscriptionStatus,
} from '@prisma/client';
import { VerifyPurchaseRequestDto } from '../dto';
import { SubscriptionPlansService } from './subscription-plans.service';

// ──────────────────────────────────────────────
// Param interfaces for lifecycle handlers
// ──────────────────────────────────────────────

interface InitialPurchaseParams {
  userId: string;
  storePlatform: StorePlatform;
  storeTransactionId: string;
  storeProductId: string;
  purchaseDate: Date;
  expiresDate: Date;
  currencyCode?: CurrencyCode;
  pricePaid?: number;
  countryCode?: string;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface RenewalParams {
  storeTransactionId: string;
  storePlatform: StorePlatform;
  newPeriodStart: Date;
  newPeriodEnd: Date;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface CancellationParams {
  storeTransactionId: string;
  storePlatform: StorePlatform;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface GracePeriodParams {
  storeTransactionId: string;
  storePlatform: StorePlatform;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface BillingRecoveryParams {
  storeTransactionId: string;
  storePlatform: StorePlatform;
  newPeriodEnd: Date;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface RevocationParams {
  storeTransactionId: string;
  storePlatform: StorePlatform;
  rawPayload?: Record<string, unknown>;
  storeEventId?: string;
}

interface LogEventParams {
  subscriptionId: string;
  eventType: SubscriptionEventType;
  storePlatform: StorePlatform;
  storeEventId?: string;
  rawPayload?: Record<string, unknown>;
}

@Injectable()
export class SubscriptionsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {
    super(logger);
  }

  // ──────────────────────────────────────────────
  // User-facing queries
  // ──────────────────────────────────────────────

  async getActiveSubscription(userId: string) {
    const subscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD],
        },
      },
      include: { plan: { include: { prices: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return subscription ?? null;
  }

  async getSubscriptionHistory(userId: string) {
    return this.prisma.userSubscription.findMany({
      where: { userId },
      include: {
        plan: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // Client-initiated purchase verification (C1 fix)
  // ──────────────────────────────────────────────

  /**
   * Called by the mobile app after a successful in-app purchase.
   * This is the only entry point for creating initial subscriptions —
   * webhook INITIAL_PURCHASE events only serve as a fallback/reconciliation.
   */
  async verifyAndCreateSubscription(
    userId: string,
    dto: VerifyPurchaseRequestDto,
  ) {
    // Idempotency: if a subscription for this purchaseToken already exists, return it
    const existing = await this.prisma.userSubscription.findFirst({
      where: { storeTransactionId: dto.purchaseToken },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.log(
        `Subscription already exists for purchaseToken "${dto.purchaseToken}", returning existing`,
      );
      return existing;
    }

    // Look up plan
    const plan = await this.subscriptionPlansService.getPlanByStoreProductId(
      dto.storePlatform,
      dto.productId,
    );

    // Determine purchase and expiry dates
    let purchaseDate: Date;
    let expiresDate: Date;

    if (dto.purchaseDate && dto.expiresDate) {
      // Client provided dates (Apple StoreKit2 / client-provided)
      purchaseDate = DateUtil.parse(dto.purchaseDate);
      expiresDate = DateUtil.parse(dto.expiresDate);
    } else {
      // Default: calculate from plan validityDays
      purchaseDate = DateUtil.now();
      expiresDate = DateUtil.dayjs(purchaseDate)
        .add(plan.validityDays, 'days')
        .toDate();
    }

    if (expiresDate <= purchaseDate) {
      throw new BadRequestException(
        'expiresDate must be after purchaseDate',
      );
    }

    return this.handleInitialPurchase({
      userId,
      storePlatform: dto.storePlatform,
      storeTransactionId: dto.purchaseToken,
      storeProductId: dto.productId,
      purchaseDate,
      expiresDate,
    });
  }

  // ──────────────────────────────────────────────
  // Lifecycle handlers (called by webhook handlers)
  // ──────────────────────────────────────────────

  async handleInitialPurchase(params: InitialPurchaseParams) {
    // Idempotency: check if subscription already exists for this store transaction
    const existing = await this.prisma.userSubscription.findFirst({
      where: { storeTransactionId: params.storeTransactionId },
      include: { plan: true },
    });

    if (existing) {
      this.logger.log(
        `Subscription already exists for storeTransactionId "${params.storeTransactionId}" — skipping initial purchase`,
      );
      return existing;
    }

    const plan = await this.subscriptionPlansService.getPlanByStoreProductId(
      params.storePlatform,
      params.storeProductId,
    );

    const subscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.create({
        data: {
          userId: params.userId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          storePlatform: params.storePlatform,
          storeTransactionId: params.storeTransactionId,
          storeProductId: params.storeProductId,
          currentPeriodStart: params.purchaseDate,
          currentPeriodEnd: params.expiresDate,
          expiresAt: params.expiresDate,
          autoRenewing: true,
          currencyCode: params.currencyCode,
          pricePaid: params.pricePaid,
          countryCode: params.countryCode,
        },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: sub.id,
          eventType: SubscriptionEventType.INITIAL_PURCHASE,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      await this.creditsService.grantCredits(
        {
          userId: params.userId,
          amount: plan.creditsGranted,
          source: CreditSource.SUBSCRIPTION,
          referenceId: sub.id,
          expiresAt: params.expiresDate.toISOString(),
        },
        tx,
      );

      return sub;
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_CREATED,
      userId: params.userId,
      resourceId: subscription.id,
      metadata: {
        planId: plan.id,
        storePlatform: params.storePlatform,
        storeTransactionId: params.storeTransactionId,
      },
    });

    return subscription;
  }

  async handleRenewal(params: RenewalParams) {
    if (await this.isEventAlreadyProcessed(params.storeEventId)) return;

    const subscription = await this.findSubscriptionByStoreTransaction(
      params.storeTransactionId,
    );

    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: params.newPeriodStart,
          currentPeriodEnd: params.newPeriodEnd,
          expiresAt: params.newPeriodEnd,
          status: SubscriptionStatus.ACTIVE,
        },
        include: { plan: true },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: sub.id,
          eventType: SubscriptionEventType.RENEWAL,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      await this.creditsService.grantCredits(
        {
          userId: sub.userId,
          amount: sub.plan.creditsGranted,
          source: CreditSource.SUBSCRIPTION,
          referenceId: sub.id,
          expiresAt: params.newPeriodEnd.toISOString(),
        },
        tx,
      );

      return sub;
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_RENEWED,
      userId: updatedSubscription.userId,
      resourceId: updatedSubscription.id,
      metadata: {
        newPeriodEnd: params.newPeriodEnd.toISOString(),
        storePlatform: params.storePlatform,
      },
    });

    return updatedSubscription;
  }

  async handleCancellation(params: CancellationParams) {
    if (await this.isEventAlreadyProcessed(params.storeEventId)) return;

    const subscription = await this.findSubscriptionByStoreTransaction(
      params.storeTransactionId,
    );

    const now = DateUtil.now();

    // Wrap in $transaction to keep update + event log atomic
    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          autoRenewing: false,
          cancelledAt: now,
        },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.CANCELLATION,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      return sub;
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_CANCELLED,
      userId: subscription.userId,
      resourceId: subscription.id,
      metadata: {
        cancelledAt: now.toISOString(),
        storePlatform: params.storePlatform,
      },
    });

    return updatedSubscription;
  }

  async handleGracePeriod(params: GracePeriodParams) {
    if (await this.isEventAlreadyProcessed(params.storeEventId)) return;

    const subscription = await this.findSubscriptionByStoreTransaction(
      params.storeTransactionId,
    );

    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.GRACE_PERIOD },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.GRACE_PERIOD_ENTERED,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      return sub;
    });

    return updatedSubscription;
  }

  async handleBillingRecovery(params: BillingRecoveryParams) {
    if (await this.isEventAlreadyProcessed(params.storeEventId)) return;

    const subscription = await this.findSubscriptionByStoreTransaction(
      params.storeTransactionId,
    );

    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: params.newPeriodEnd,
          expiresAt: params.newPeriodEnd,
        },
        include: { plan: true },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: sub.id,
          eventType: SubscriptionEventType.BILLING_RECOVERY,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      await this.creditsService.grantCredits(
        {
          userId: sub.userId,
          amount: sub.plan.creditsGranted,
          source: CreditSource.SUBSCRIPTION,
          referenceId: sub.id,
          expiresAt: params.newPeriodEnd.toISOString(),
        },
        tx,
      );

      return sub;
    });

    return updatedSubscription;
  }

  async handleRevocation(params: RevocationParams) {
    if (await this.isEventAlreadyProcessed(params.storeEventId)) return;

    const subscription = await this.findSubscriptionByStoreTransaction(
      params.storeTransactionId,
    );

    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.REVOKED },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.REVOCATION,
          storePlatform: params.storePlatform,
          storeEventId: params.storeEventId,
          rawPayload: params.rawPayload,
        },
        tx,
      );

      return sub;
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_REVOKED,
      userId: subscription.userId,
      resourceId: subscription.id,
      metadata: { storePlatform: params.storePlatform },
    });

    return updatedSubscription;
  }

  async handleExpiry(storeTransactionId: string, storePlatform: StorePlatform) {
    const subscription =
      await this.findSubscriptionByStoreTransaction(storeTransactionId);

    // Don't re-expire an already expired/revoked subscription
    if (
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.REVOKED
    ) {
      this.logger.log(
        `Subscription "${subscription.id}" already in terminal state "${subscription.status}" — skipping expiry`,
      );
      return subscription;
    }

    const updatedSubscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      await this.logSubscriptionEvent(
        {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.EXPIRY,
          storePlatform,
        },
        tx,
      );

      return sub;
    });

    this.emitAuditLog({
      actionType: AuditActionType.SUBSCRIPTION_EXPIRED,
      userId: subscription.userId,
      resourceId: subscription.id,
      metadata: { storePlatform },
    });

    return updatedSubscription;
  }

  // ──────────────────────────────────────────────
  // Maintenance (C3 fix — atomic batch)
  // ──────────────────────────────────────────────

  async expireSubscriptions(): Promise<number> {
    const now = DateUtil.now();

    return this.prisma.$transaction(async (tx) => {
      const expiredSubscriptions = await tx.userSubscription.findMany({
        where: {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD],
          },
          expiresAt: { lte: now },
        },
      });

      if (expiredSubscriptions.length === 0) {
        return 0;
      }

      const ids = expiredSubscriptions.map((s) => s.id);

      // Batch status update
      await tx.userSubscription.updateMany({
        where: { id: { in: ids } },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      // Batch event creation
      await tx.subscriptionEvent.createMany({
        data: expiredSubscriptions.map((s) => ({
          subscriptionId: s.id,
          eventType: SubscriptionEventType.EXPIRY,
          storePlatform: s.storePlatform,
        })),
      });

      this.logger.log(
        `Expired ${expiredSubscriptions.length} subscription(s) past their expiresAt date.`,
      );

      return expiredSubscriptions.length;
    });
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  async findSubscriptionByStoreTransaction(storeTransactionId: string) {
    const subscription = await this.prisma.userSubscription.findFirst({
      where: { storeTransactionId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with store transaction ID "${storeTransactionId}" not found`,
      );
    }

    return subscription;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * C2 fix — Idempotency guard.
   * Returns true if a SubscriptionEvent with this storeEventId already exists,
   * meaning the webhook has already been processed.
   */
  private async isEventAlreadyProcessed(
    storeEventId?: string,
  ): Promise<boolean> {
    if (!storeEventId) return false;

    const existing = await this.prisma.subscriptionEvent.findFirst({
      where: { storeEventId },
      select: { id: true },
    });

    if (existing) {
      this.logger.log(
        `Duplicate webhook event "${storeEventId}" — already processed, skipping`,
      );
      return true;
    }

    return false;
  }

  private async logSubscriptionEvent(
    params: LogEventParams,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    await client.subscriptionEvent.create({
      data: {
        subscriptionId: params.subscriptionId,
        eventType: params.eventType,
        storePlatform: params.storePlatform,
        storeEventId: params.storeEventId,
        rawPayload: (params.rawPayload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }
}

import { DateUtil } from '@common/utils/date.utils';
import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsService } from '@modules/credits/credits.service';
import { SubscriptionPlansService } from '@modules/subscriptions/services/subscription-plans.service';
import { TransactionsService } from '@modules/transactions/transactions.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditSource, Prisma, TransactionStatus } from '@prisma/client';

import { PurchaseEventType } from '../enums/purchase-event-type.enum';
import { ParsedPurchaseEvent } from '../interfaces/purchase-event.interface';
import { WebhookPurchaseHandler } from './webhook-handler.interface';

/**
 * Crockford base32, the alphabet Prisma's `ulid()` draws from. Matching the shape
 * before querying keeps a foreign identifier — a leftover Firebase UID from an
 * older client build, or a `$RCAnonymousID:` handle — from reaching the database
 * as a lookup at all.
 */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/**
 * Grants credits for a completed one-time purchase.
 *
 * The gateway is the source of the money event; this system is the source of
 * truth for the balance. Every branch that cannot produce a grant — an unknown
 * product, an unresolvable customer, a redelivered event — completes normally so
 * the controller can answer 2xx. Retrying those would never succeed, and the
 * gateway would keep redelivering until the event expired. Genuine faults (a
 * database outage) are allowed to propagate, because those *are* worth a retry.
 */
@Injectable()
export class RevenueCatPurchaseHandler
  extends BaseHandler
  implements WebhookPurchaseHandler
{
  private readonly defaultExpiryDays: number;

  constructor(
    logger: LoggerService,
    // Queried directly rather than through a domain service: resolution is a
    // single existence check against candidate IDs, not a users-domain concern.
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly transactionsService: TransactionsService,
    private readonly creditsService: CreditsService,
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {
    super(logger);
    this.defaultExpiryDays = this.configService.get<number>(
      'CREDIT_EXPIRY_DAYS',
      90,
    );
  }

  canHandle(event: ParsedPurchaseEvent): boolean {
    return event.type === PurchaseEventType.PURCHASE;
  }

  async handle(event: ParsedPurchaseEvent): Promise<void> {
    const ctx = {
      gateway: event.gateway,
      providerEventType: event.providerEventType,
      gatewayTransactionId: event.gatewayTransactionId,
      productId: event.productId,
      environment: event.environment,
    };

    if (!event.gatewayTransactionId || !event.productId) {
      this.logger.warn(
        'Purchase event missing transaction ID or product ID — skipping',
        { ...ctx, step: 'validate_event' },
      );
      return;
    }

    // Cheap pre-check: an already-processed redelivery costs one indexed read
    // instead of an aborted write transaction. The unique constraint below is
    // still what guarantees correctness under concurrent redelivery.
    const existing = await this.transactionsService.findByGatewayTransaction(
      event.gateway,
      event.gatewayTransactionId,
    );

    if (existing) {
      this.logger.debug('Purchase already processed — skipping', {
        ...ctx,
        transactionId: existing.id,
        step: 'idempotency_check',
      });
      return;
    }

    const userId = await this.resolveUserId(event.candidateUserIds);

    if (!userId) {
      this.logger.warn(
        'Could not resolve a local user for purchase — recording unattributed',
        {
          ...ctx,
          candidateCount: event.candidateUserIds.length,
          step: 'resolve_user',
        },
      );
    }

    const plan = await this.findPlanForProduct(event.productId);

    if (!plan) {
      // Recorded rather than dropped: the money moved, and an unmapped product
      // is a configuration gap someone needs to see and reconcile.
      this.logger.warn(
        'No plan configured for product — recording without grant',
        {
          ...ctx,
          step: 'resolve_plan',
        },
      );
      await this.recordOnly(event, userId, TransactionStatus.PENDING);
      return;
    }

    const validityDays =
      plan.validityDays > 0 ? plan.validityDays : this.defaultExpiryDays;
    const expiresAt = DateUtil.addDays(DateUtil.now(), validityDays);

    try {
      await this.prisma.$transaction(async (tx) => {
        const transaction = await this.transactionsService.record(
          {
            userId: userId ?? undefined,
            gateway: event.gateway,
            gatewayTransactionId: event.gatewayTransactionId as string,
            gatewayEventId: event.gatewayEventId ?? undefined,
            gatewayUserId: event.gatewayUserId ?? undefined,
            status: TransactionStatus.COMPLETED,
            environment: event.environment,
            productId: event.productId as string,
            creditsGranted: userId ? plan.creditsGranted : undefined,
            amount: event.amount ?? undefined,
            currency: event.currency ?? undefined,
            countryCode: event.countryCode ?? undefined,
            occurredAt: event.occurredAt.toISOString(),
            rawPayload: event.raw,
          },
          tx,
        );

        // An unattributed purchase is recorded but grants nothing — there is no
        // account to credit until someone reconciles it by hand.
        if (!userId) return;

        await this.creditsService.grantCredits(
          {
            userId,
            amount: plan.creditsGranted,
            source: CreditSource.PURCHASE,
            referenceId: transaction.id,
            expiresAt: expiresAt.toISOString(),
          },
          tx,
        );

        this.logger.log('Purchase granted credits', {
          ...ctx,
          transactionId: transaction.id,
          userId,
          creditsGranted: plan.creditsGranted,
          expiresAt: expiresAt.toISOString(),
          step: 'complete',
        });
      });
    } catch (error) {
      // Lost the race against a concurrent redelivery — the other attempt did
      // the work, so this one is complete.
      if (this.isDuplicate(error)) {
        this.logger.debug(
          'Concurrent delivery already processed this purchase',
          {
            ...ctx,
            step: 'idempotency_conflict',
          },
        );
        return;
      }
      throw error;
    }
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Finds the first candidate identifier that resolves to a live account.
   *
   * The gateway sends the logged-in handle alongside every alias it has ever
   * associated with the customer, in no guaranteed order — two deliveries for
   * the same customer have been observed with the array reversed — so every
   * candidate is tried rather than just the first.
   */
  private async resolveUserId(
    candidateUserIds: string[],
  ): Promise<string | null> {
    for (const candidate of candidateUserIds) {
      if (!ULID_PATTERN.test(candidate)) continue;

      const user = await this.prisma.user.findFirst({
        where: { id: candidate, deletedAt: null },
        select: { id: true },
      });

      if (user) return user.id;
    }

    return null;
  }

  /**
   * Resolves the store product ID to its plan, returning `null` rather than
   * throwing — an unmapped product is a configuration gap to record, not a
   * fault to retry.
   */
  private async findPlanForProduct(productId: string) {
    try {
      return await this.subscriptionPlansService.getPlanByProductId(productId);
    } catch {
      return null;
    }
  }

  /**
   * Persists the transaction without a credit grant, tolerating a duplicate that
   * arrived while this delivery was in flight.
   */
  private async recordOnly(
    event: ParsedPurchaseEvent,
    userId: string | null,
    status: TransactionStatus,
  ): Promise<void> {
    try {
      await this.transactionsService.record({
        userId: userId ?? undefined,
        gateway: event.gateway,
        gatewayTransactionId: event.gatewayTransactionId as string,
        gatewayEventId: event.gatewayEventId ?? undefined,
        gatewayUserId: event.gatewayUserId ?? undefined,
        status,
        environment: event.environment,
        productId: event.productId as string,
        amount: event.amount ?? undefined,
        currency: event.currency ?? undefined,
        countryCode: event.countryCode ?? undefined,
        occurredAt: event.occurredAt.toISOString(),
        rawPayload: event.raw,
      });
    } catch (error) {
      if (this.isDuplicate(error)) return;
      throw error;
    }
  }

  /** Whether an error is the unique-constraint violation that marks a redelivery. */
  private isDuplicate(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

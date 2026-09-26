import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  CreditSource,
  PaymentGateway,
  PaymentOrderStatus,
  Prisma,
  TransactionChannel,
  TransactionEnvironment,
  TransactionStatus,
} from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsService } from '@modules/credits/credits.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import { RazorpayGateway } from './gateways/razorpay/razorpay.gateway';
import { PaymentGatewayAdapter } from './gateways/payment-gateway.interface';
import {
  PAYMENT_COMPLETED_EVENT,
  PaymentCompletedEvent,
} from './events/payment-completed.event';

/** PENDING orders older than this are eligible for reconciliation. */
const STALE_AFTER_MINUTES = 15;
/** PENDING orders older than this are expired without a gateway check. */
const EXPIRE_AFTER_MINUTES = 30;

/**
 * Reconciles stale PENDING payment orders by polling the gateway for their
 * actual status. Runs every 2 minutes via `@Cron`.
 *
 * This is the **safety net** for payments where the Razorpay webhook was
 * never delivered (network failure, Cloud Run cold-start, dashboard test).
 * Without reconciliation, a user who paid might never receive their credits.
 *
 * ## Idempotency
 * Fulfillment uses the same atomic `$transaction` block as the webhook handler.
 * The `@@unique([gateway, gatewayTransactionId])` constraint on `Transaction`
 * ensures credits are never double-granted, even if the webhook and the cron
 * race on the same payment.
 */
@Injectable()
export class PaymentsReconciliationService extends BaseService {
  private readonly gatewayMap: Map<string, PaymentGatewayAdapter>;
  private readonly defaultCreditExpiryDays: number;
  private readonly isProduction: boolean;

  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly creditsService: CreditsService,
    private readonly transactionsService: TransactionsService,
    private readonly razorpayGateway: RazorpayGateway,
  ) {
    super(logger);
    this.gatewayMap = new Map([[razorpayGateway.provider, razorpayGateway]]);
    this.defaultCreditExpiryDays = this.configService.get<number>(
      'CREDIT_EXPIRY_DAYS',
      90,
    );
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Polls all PENDING orders older than 15 minutes and settles their status.
   *
   * - Captured → fulfil (mark PAID, grant credits, emit PAYMENT_COMPLETED_EVENT).
   * - Failed / cancelled → mark FAILED.
   * - Still pending + older than 30 min → mark EXPIRED.
   *
   * Runs every 2 minutes. Each invocation is independent — no shared state.
   */
  @Cron('*/2 * * * *')
  async reconcileStaleOrders(): Promise<void> {
    const now = DateUtil.now();
    const staleThreshold = DateUtil.dayjs(now)
      .subtract(STALE_AFTER_MINUTES, 'minute')
      .toDate();

    const staleOrders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.PENDING,
        createdAt: { lt: staleThreshold },
      },
      include: {
        plan: {
          select: { id: true, creditsGranted: true, validityDays: true },
        },
      },
      take: 50, // process at most 50 per tick to bound execution time
    });

    if (staleOrders.length === 0) return;

    this.logger.debug('Reconciliation: processing stale orders', {
      count: staleOrders.length,
      step: 'reconcile_start',
    });

    let settled = 0;
    let failed = 0;
    let expired = 0;

    for (const order of staleOrders) {
      const ctx = {
        orderId: order.id,
        userId: order.userId,
        gateway: order.gateway,
        gatewayOrderId: order.gatewayOrderId,
        step: 'reconcile_order',
      };

      try {
        const adapter = this.gatewayMap.get(order.gateway);
        if (!adapter) {
          this.logger.warn('Reconciliation: no adapter for gateway', ctx);
          continue;
        }

        // Orders older than EXPIRE_AFTER_MINUTES are expired without polling.
        const expireThreshold = DateUtil.dayjs(now)
          .subtract(EXPIRE_AFTER_MINUTES, 'minute')
          .toDate();

        if (order.createdAt < expireThreshold) {
          await this.prisma.paymentOrder.update({
            where: { id: order.id, status: PaymentOrderStatus.PENDING },
            data: { status: PaymentOrderStatus.EXPIRED },
          });
          expired++;
          this.logger.log('Reconciliation: order expired', ctx);
          continue;
        }

        const gatewayStatus = await adapter.fetchOrderStatus(
          order.gatewayOrderId,
        );

        if (gatewayStatus === 'CAPTURED' || gatewayStatus === 'AUTHORIZED') {
          // We don't have the payment id from the gateway poll alone.
          // Use the gatewayOrderId as the gatewayTransactionId for deduplication.
          // In practice, Razorpay returns full payment data when we call fetchPayments.
          await this.fulfilFromReconciliation(order, ctx);
          settled++;
        } else if (
          gatewayStatus === 'FAILED' ||
          gatewayStatus === 'CANCELLED'
        ) {
          await this.prisma.paymentOrder.update({
            where: { id: order.id, status: PaymentOrderStatus.PENDING },
            data: { status: PaymentOrderStatus.FAILED },
          });
          failed++;
          this.logger.log('Reconciliation: order marked FAILED', ctx);
        }
        // PENDING = still waiting, do nothing this tick.
      } catch (error) {
        this.logger.error('Reconciliation: error processing order', {
          ...ctx,
          err: serializeError(error),
        });
        // Do not rethrow — continue processing remaining orders.
      }
    }

    this.logger.event(LOG_EVENT.SUBSCRIPTION_PURCHASE_COMPLETED, {
      total: staleOrders.length,
      settled,
      failed,
      expired,
      step: 'reconcile_complete',
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fetches the gateway payment ID (needed as `gatewayTransactionId`) from
   * the Razorpay order and fulfils the order atomically.
   *
   * Using `gatewayOrderId` as the idempotency key would collide if a later
   * verify call uses the real `paymentId`. We fetch the actual payment so
   * the Transaction row uses the true Razorpay payment ID.
   */
  private async fulfilFromReconciliation(
    order: {
      id: string;
      userId: string;
      planId: string;
      plan: { id: string; creditsGranted: number; validityDays: number };
      amount: number;
      currency: string;
      countryCode: string;
      gateway: PaymentGateway;
      gatewayOrderId: string;
    },
    ctx: Record<string, unknown>,
  ): Promise<void> {
    let gatewayPaymentId = `rcn_${order.gatewayOrderId}`;

    // For Razorpay, fetch the actual payment ID from the order.
    if (order.gateway === PaymentGateway.RAZORPAY) {
      try {
        const adapter = this.gatewayMap.get(order.gateway);
        if (adapter?.fetchCapturedPaymentId) {
          const paymentId = await adapter.fetchCapturedPaymentId(
            order.gatewayOrderId,
          );
          if (paymentId) {
            gatewayPaymentId = paymentId;
          }
        }
      } catch {
        // Fall through — use the fallback reconciliation ID.
      }
    }

    const validityDays =
      order.plan.validityDays > 0
        ? order.plan.validityDays
        : this.defaultCreditExpiryDays;
    const expiresAt = DateUtil.addDays(DateUtil.now(), validityDays);
    const environment = this.isProduction
      ? TransactionEnvironment.PRODUCTION
      : TransactionEnvironment.SANDBOX;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentOrder.update({
          where: { id: order.id, status: PaymentOrderStatus.PENDING },
          data: { status: PaymentOrderStatus.PAID },
        });

        const transaction = await this.transactionsService.record(
          {
            userId: order.userId,
            gateway: order.gateway,
            gatewayTransactionId: gatewayPaymentId,
            gatewayEventId: order.gatewayOrderId,
            status: TransactionStatus.COMPLETED,
            environment,
            channel: TransactionChannel.WEB,
            productId: order.planId,
            creditsGranted: order.plan.creditsGranted,
            amount: order.amount / 100,
            currency: order.currency,
            countryCode: order.countryCode,
            occurredAt: DateUtil.now().toISOString(),
          },
          tx,
        );

        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { transactionId: transaction.id },
        });

        await this.creditsService.grantCredits(
          {
            userId: order.userId,
            amount: order.plan.creditsGranted,
            source: CreditSource.PURCHASE,
            referenceId: transaction.id,
            expiresAt: expiresAt.toISOString(),
          },
          tx,
        );
      });

      this.eventEmitter.emit(
        PAYMENT_COMPLETED_EVENT,
        new PaymentCompletedEvent(
          order.userId,
          order.id,
          order.plan.creditsGranted,
          order.amount,
          order.currency,
        ),
      );

      this.logger.log('Reconciliation: order settled and credits granted', {
        ...ctx,
        creditsGranted: order.plan.creditsGranted,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2025')
      ) {
        this.logger.debug(
          'Reconciliation: concurrent processing already settled this order',
          ctx,
        );
        return;
      }
      throw error;
    }
  }
}

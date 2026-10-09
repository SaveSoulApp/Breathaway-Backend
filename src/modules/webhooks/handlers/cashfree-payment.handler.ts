import { Injectable } from '@nestjs/common';
import { PaymentGateway, PaymentOrderStatus, Prisma } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PaymentsService } from '@modules/payments/payments.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import { CashfreeWebhookRequestDto } from '../dto/request/cashfree-payment-webhook.request.dto';

/** Cashfree events that represent a successfully captured payment. */
const CAPTURE_EVENTS = new Set(['PAYMENT_SUCCESS_WEBHOOK', 'ORDER_PAID']);
/** Cashfree events that represent a definitively failed payment. */
const FAILURE_EVENTS = new Set([
  'PAYMENT_FAILED_WEBHOOK',
  'PAYMENT_USER_DROPPED_WEBHOOK',
]);

/**
 * Processes inbound Cashfree webhook events.
 *
 * ## Responsibilities
 * - On `PAYMENT_SUCCESS_WEBHOOK` / `ORDER_PAID`: mark `PaymentOrder` PAID,
 *   record `Transaction`, and grant credits — atomically, in one `$transaction`.
 * - On `PAYMENT_FAILED_WEBHOOK` / `PAYMENT_USER_DROPPED_WEBHOOK`: mark `PaymentOrder` FAILED.
 * - All other events: acknowledged (200) and ignored.
 *
 * ## Idempotency
 * A pre-check via `TransactionsService.findByGatewayTransaction` avoids entering
 * the expensive `$transaction` for already-processed redeliveries. The
 * `@@unique([gateway, gatewayTransactionId])` constraint on `Transaction` is the
 * final correctness guard for concurrent redeliveries that slip through.
 */
@Injectable()
export class CashfreePaymentHandler extends BaseHandler {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly paymentsService: PaymentsService,
  ) {
    super(logger);
  }

  canHandle(dto: CashfreeWebhookRequestDto): boolean {
    return (
      CAPTURE_EVENTS.has(dto.event_type) || FAILURE_EVENTS.has(dto.event_type)
    );
  }

  async handle(dto: CashfreeWebhookRequestDto): Promise<void> {
    const orderId = dto.data?.order?.order_id;
    const payment = dto.data?.payment;
    const paymentId = payment?.cf_payment_id
      ? String(payment.cf_payment_id)
      : undefined;

    const ctx = {
      event: dto.event_type,
      paymentId,
      orderId,
      step: 'cashfree_payment_handler',
    };

    if (!orderId) {
      this.logger.warn('Cashfree webhook missing order ID', ctx);
      return;
    }

    // ── Failure path ────────────────────────────────────────────────────────
    if (FAILURE_EVENTS.has(dto.event_type)) {
      await this.handlePaymentFailed(orderId, ctx);
      return;
    }

    // ── Capture path ────────────────────────────────────────────────────────
    if (!paymentId) {
      this.logger.warn('Cashfree capture webhook missing payment ID', ctx);
      return;
    }

    // 1. Cheap idempotency pre-check.
    const existing = await this.transactionsService.findByGatewayTransaction(
      PaymentGateway.CASHFREE,
      paymentId,
    );

    if (existing) {
      this.logger.debug('Cashfree webhook: payment already processed — skip', {
        ...ctx,
        transactionId: existing.id,
      });

      // Attach raw payload if not already recorded.
      const payloadObj = existing.rawPayload as Record<string, unknown> | null;
      if (!payloadObj || !('event_type' in payloadObj)) {
        await this.transactionsService.attachRawPayload(
          existing.id,
          dto as unknown as Record<string, unknown>,
        );
      }

      return;
    }

    // 2. Resolve PaymentOrder by gateway order ID.
    const order = await this.prisma.paymentOrder.findFirst({
      where: {
        gatewayOrderId: orderId,
        gateway: PaymentGateway.CASHFREE,
      },
      include: {
        plan: {
          select: { id: true, creditsGranted: true, validityDays: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(
        'Cashfree webhook: PaymentOrder not found for gatewayOrderId',
        ctx,
      );
      return;
    }

    if (order.status === PaymentOrderStatus.PAID) {
      this.logger.debug(
        'Cashfree webhook: order already PAID — idempotent skip',
        ctx,
      );
      return;
    }

    // 3. Fulfil atomically via shared PaymentsService method.
    try {
      await this.paymentsService.fulfil({
        order: {
          id: order.id,
          userId: order.userId,
          planId: order.planId,
          plan: order.plan,
          amount: order.amount,
          currency: order.currency,
          countryCode: order.countryCode,
          gateway: order.gateway,
        },
        gatewayPaymentId: paymentId,
        gatewayOrderId: orderId,
        ctx,
        rawPayload: dto as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (this.isDuplicate(error)) {
        this.logger.debug(
          'Cashfree webhook: concurrent delivery already processed payment',
          ctx,
        );
        return;
      }
      this.logger.error('Cashfree webhook: fulfillment failed', {
        ...ctx,
        err: serializeError(error),
      });
      throw error; // propagate -> Cashfree retries
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async handlePaymentFailed(
    gatewayOrderId: string,
    ctx: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.paymentOrder.updateMany({
        where: {
          gatewayOrderId,
          gateway: PaymentGateway.CASHFREE,
          status: PaymentOrderStatus.PENDING,
        },
        data: { status: PaymentOrderStatus.FAILED },
      });
      this.logger.log('Cashfree webhook: order marked FAILED', ctx);
    } catch (error) {
      this.logger.error('Cashfree webhook: failed to mark order FAILED', {
        ...ctx,
        err: serializeError(error),
      });
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

import { Injectable } from '@nestjs/common';
import { PaymentGateway, PaymentOrderStatus, Prisma } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PaymentsService } from '@modules/payments/payments.service';
import { TransactionsService } from '@modules/transactions/transactions.service';

import { RazorpayWebhookRequestDto } from '../dto/request/razorpay-payment-webhook.request.dto';

/** Razorpay events that represent a successfully captured payment. */
const CAPTURE_EVENTS = new Set(['payment.captured', 'payment.authorized']);
/** Razorpay events that represent a definitively failed payment. */
const FAILURE_EVENTS = new Set(['payment.failed']);

/**
 * Processes inbound Razorpay webhook events.
 *
 * ## Responsibilities
 * - On `payment.captured` / `payment.authorized`: mark the `PaymentOrder` PAID,
 *   record the `Transaction`, and grant credits — atomically, in one `$transaction`.
 * - On `payment.failed`: mark the `PaymentOrder` FAILED.
 * - All other events: acknowledged (200) and ignored.
 *
 * ## Idempotency
 * A pre-check via `TransactionsService.findByGatewayTransaction` avoids entering
 * the expensive `$transaction` for already-processed redeliveries. The
 * `@@unique([gateway, gatewayTransactionId])` constraint on `Transaction` is the
 * final correctness guard for concurrent redeliveries that slip through.
 *
 * ## Error handling
 * Genuine infrastructure faults (DB outage) are allowed to propagate so Razorpay
 * will retry the delivery. Unactionable events (unknown gateway order ID, missing
 * plan) are logged and return 200 to stop infinite retries.
 */
@Injectable()
export class RazorpayPaymentHandler extends BaseHandler {
  constructor(
    logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly paymentsService: PaymentsService,
  ) {
    super(logger);
  }

  canHandle(dto: RazorpayWebhookRequestDto): boolean {
    return CAPTURE_EVENTS.has(dto.event) || FAILURE_EVENTS.has(dto.event);
  }

  async handle(dto: RazorpayWebhookRequestDto): Promise<void> {
    const payment = dto.payload?.payment?.entity;
    const ctx = {
      event: dto.event,
      eventId: dto.event_id,
      paymentId: payment?.id,
      orderId: payment?.order_id,
      step: 'razorpay_payment_handler',
    };

    if (!payment?.id || !payment?.order_id) {
      this.logger.warn('Razorpay webhook missing payment or order ID', ctx);
      return;
    }

    // ── Failure path ────────────────────────────────────────────────────────
    if (FAILURE_EVENTS.has(dto.event)) {
      await this.handlePaymentFailed(payment.order_id, ctx);
      return;
    }

    // ── Capture path ────────────────────────────────────────────────────────

    // 1. Cheap idempotency pre-check.
    const existing = await this.transactionsService.findByGatewayTransaction(
      PaymentGateway.RAZORPAY,
      payment.id,
    );

    if (existing) {
      this.logger.debug('Razorpay webhook: payment already processed — skip', {
        ...ctx,
        transactionId: existing.id,
      });

      // If initially recorded via client-side verify without the full webhook payload,
      // attach the full sanitized webhook payload for diagnostics and audit.
      const payloadObj = existing.rawPayload as Record<string, unknown> | null;
      if (!payloadObj || !('event' in payloadObj)) {
        await this.transactionsService.attachRawPayload(
          existing.id,
          dto as unknown as Record<string, unknown>,
        );
      }

      return;
    }

    // 2. Resolve the PaymentOrder by gateway order ID.
    const order = await this.prisma.paymentOrder.findFirst({
      where: {
        gatewayOrderId: payment.order_id,
        gateway: PaymentGateway.RAZORPAY,
      },
      include: {
        plan: {
          select: { id: true, creditsGranted: true, validityDays: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(
        'Razorpay webhook: PaymentOrder not found for gatewayOrderId',
        ctx,
      );
      // Return 200 — retrying will never help without a matching order row.
      return;
    }

    if (order.status === PaymentOrderStatus.PAID) {
      this.logger.debug(
        'Razorpay webhook: order already PAID — idempotent skip',
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
        gatewayPaymentId: payment.id,
        gatewayOrderId: payment.order_id,
        ctx,
        rawPayload: dto as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (this.isDuplicate(error)) {
        this.logger.debug(
          'Razorpay webhook: concurrent delivery already processed payment',
          ctx,
        );
        return;
      }
      this.logger.error('Razorpay webhook: fulfillment failed', {
        ...ctx,
        err: serializeError(error),
      });
      throw error; // propagate → Razorpay will retry
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
          gateway: PaymentGateway.RAZORPAY,
          status: PaymentOrderStatus.PENDING,
        },
        data: { status: PaymentOrderStatus.FAILED },
      });
      this.logger.log('Razorpay webhook: order marked FAILED', ctx);
    } catch (error) {
      this.logger.error('Razorpay webhook: failed to mark order FAILED', {
        ...ctx,
        err: serializeError(error),
      });
      // Do not rethrow — a failure to mark FAILED is not worth infinite retries.
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

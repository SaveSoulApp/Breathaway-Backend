import { createHmac, timingSafeEqual } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from '@prisma/client';
import Razorpay from 'razorpay';

import { DateUtil } from '@common/utils/date.utils';
import { GatewayOrderCreationException } from '@modules/payments/application/exceptions';

import {
  GatewayCreateOrderParams,
  GatewayOrderResult,
  GatewayOrderStatus,
  GatewayVerifyParams,
  PaymentGatewayAdapter,
} from '../payment-gateway.interface';

/**
 * Adapts the Razorpay Node SDK to the `PaymentGatewayAdapter` contract.
 *
 * All credentials are read from `ConfigService` — never from `process.env` directly.
 * `RAZORPAY_KEY_ID` is safe to surface to the browser (it appears in order responses).
 * `RAZORPAY_KEY_SECRET` never leaves the server.
 *
 * Signature verification follows the Razorpay standard:
 *   HMAC-SHA256(keySecret, "{razorpay_order_id}|{razorpay_payment_id}")
 * compared with `timingSafeEqual` to prevent timing-based attacks.
 */
@Injectable()
export class RazorpayGateway implements PaymentGatewayAdapter {
  readonly provider = PaymentGateway.RAZORPAY;

  private readonly client: Razorpay;
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(private readonly configService: ConfigService) {
    this.keyId = this.configService.getOrThrow<string>('RAZORPAY_KEY_ID');
    this.keySecret = this.configService.getOrThrow<string>(
      'RAZORPAY_KEY_SECRET',
    );
    this.client = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  /**
   * Creates a Razorpay order.
   *
   * Razorpay uses `amount` in the **smallest currency unit** (paise for INR).
   * The `receipt` field is our internal `PaymentOrder.id` — surfaced in the
   * Razorpay dashboard for easy cross-reference.
   *
   * @throws {GatewayOrderCreationException} When the Razorpay API call fails.
   */
  async createOrder(
    params: GatewayCreateOrderParams,
  ): Promise<GatewayOrderResult> {
    let rzpOrder: { id: string; created_at: number; status: string };
    try {
      const created = await this.client.orders.create({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
      });
      rzpOrder = created as unknown as {
        id: string;
        created_at: number;
        status: string;
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GatewayOrderCreationException('RAZORPAY', message);
    }

    return {
      gatewayOrderId: String(rzpOrder.id),
      gatewayCreatedAt: DateUtil.parse(Number(rzpOrder.created_at) * 1000),
      action: {
        type: 'sdk',
        keyId: this.keyId,
        gatewayOrderId: String(rzpOrder.id),
        prefill: {
          contact: params.userContact,
          name: params.userName,
        },
      },
    };
  }

  /**
   * Polls Razorpay for the current order status.
   *
   * Used by the reconciliation cron for stale PENDING orders.
   * Razorpay order statuses: `created`, `attempted`, `paid`.
   * Corresponding payment statuses are resolved by fetching payments on the order.
   */
  async fetchOrderStatus(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    try {
      const order = await this.client.orders.fetch(gatewayOrderId);

      if (order.status === 'paid') return 'CAPTURED';

      // For `attempted` orders, inspect the individual payments to find failures.
      if (order.status === 'attempted') {
        const payments = await this.client.orders.fetchPayments(gatewayOrderId);
        const items =
          (payments as { items?: { status: string }[] }).items ?? [];
        const hasFailed = items.some((p) => p.status === 'failed');
        if (hasFailed) return 'FAILED';
      }

      return 'PENDING';
    } catch {
      // If the order cannot be fetched, treat it as still pending.
      return 'PENDING';
    }
  }

  /**
   * Fetches the captured payment ID from the gateway order.
   * Used by reconciliation to get the exact gateway payment ID.
   */
  async fetchCapturedPaymentId(gatewayOrderId: string): Promise<string | null> {
    try {
      const payments = await this.client.orders.fetchPayments(gatewayOrderId);
      const items =
        (payments as unknown as { items?: { id: string; status: string }[] })
          ?.items ?? [];
      const captured = items.find(
        (p) => p.status === 'captured' || p.status === 'authorized',
      );
      return captured?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Verifies the Razorpay checkout signature.
   *
   * Razorpay's algorithm:
   *   expected = HMAC-SHA256(keySecret, "{razorpay_order_id}|{razorpay_payment_id}")
   *
   * Comparison uses `timingSafeEqual` to prevent timing-based side-channel attacks.
   */
  verifySignature(params: GatewayVerifyParams): boolean {
    const signed = `${params.gatewayOrderId}|${params.gatewayPaymentId}`;
    const expected = createHmac('sha256', this.keySecret)
      .update(signed)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(params.signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}

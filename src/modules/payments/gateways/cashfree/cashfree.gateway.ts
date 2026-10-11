import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from '@prisma/client';
import { Cashfree, CFEnvironment } from 'cashfree-pg';

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
 * Adapts the Cashfree PG Node SDK to the `PaymentGatewayAdapter` contract.
 *
 * All credentials are read from `ConfigService` — never from `process.env` directly.
 * `CASHFREE_APP_ID` is safe to surface to the browser/SDK.
 * `CASHFREE_SECRET_KEY` never leaves the server.
 *
 * Note on amounts:
 * Breathaway internal amounts are stored in smallest currency units (e.g. paise for INR).
 * Cashfree PG API expects currency in decimal format (e.g. 399.00 for ₹399).
 * The adapter divides the amount by 100 before dispatching to Cashfree.
 */
@Injectable()
export class CashfreeGateway implements PaymentGatewayAdapter {
  readonly provider = PaymentGateway.CASHFREE;

  private readonly client: Cashfree;
  private readonly appId: string;
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.getOrThrow<string>('CASHFREE_APP_ID');
    this.secretKey = this.configService.getOrThrow<string>(
      'CASHFREE_SECRET_KEY',
    );

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const env = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

    // Initialize Cashfree client; set 7th param (XEnableErrorAnalytics) to false to prevent external Sentry calls.
    this.client = new Cashfree(
      env,
      this.appId,
      this.secretKey,
      '',
      '',
      '',
      false,
    );
  }

  /**
   * Creates a Cashfree payment order.
   *
   * Cashfree expects `order_amount` as a decimal currency amount (rupees for INR).
   * Customer details require at least `customer_id` and either `customer_phone` or `customer_email`.
   *
   * @throws {GatewayOrderCreationException} When the Cashfree API call fails.
   */
  async createOrder(
    params: GatewayCreateOrderParams,
  ): Promise<GatewayOrderResult> {
    const decimalAmount = Number((params.amount / 100).toFixed(2));
    const customerId = (params.userId ?? params.receipt).slice(0, 50);

    const orderRequest = {
      order_id: params.receipt,
      order_amount: decimalAmount,
      order_currency: params.currency,
      customer_details: {
        customer_id: customerId,
        customer_phone: params.userContact || '9999999999',
        customer_name: params.userName || undefined,
        customer_email: params.userEmail || undefined,
      },
    };

    try {
      const response = await this.client.PGCreateOrder(orderRequest);
      const cfOrder = response.data;

      return {
        gatewayOrderId: String(cfOrder.order_id),
        gatewayCreatedAt: cfOrder.created_at
          ? DateUtil.parse(cfOrder.created_at)
          : DateUtil.now(),
        action: {
          type: 'sdk',
          keyId: this.appId,
          gatewayOrderId: String(cfOrder.order_id),
          paymentSessionId: cfOrder.payment_session_id ?? undefined,
          prefill: {
            contact: params.userContact,
            name: params.userName,
          },
        },
      };
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ??
        (error instanceof Error ? error.message : String(error));
      throw new GatewayOrderCreationException('CASHFREE', message);
    }
  }

  /**
   * Polls Cashfree for the current order status.
   *
   * Used by the reconciliation cron for stale PENDING orders.
   * Cashfree order statuses: `PAID`, `ACTIVE`, `EXPIRED`, `TERMINATED`.
   */
  async fetchOrderStatus(gatewayOrderId: string): Promise<GatewayOrderStatus> {
    try {
      const response = await this.client.PGFetchOrder(gatewayOrderId);
      const status = response.data?.order_status;

      if (status === 'PAID') return GatewayOrderStatus.CAPTURED;
      if (status === 'ACTIVE') return GatewayOrderStatus.PENDING;
      if (status === 'EXPIRED') return GatewayOrderStatus.CANCELLED;
      if (status === 'TERMINATED') return GatewayOrderStatus.FAILED;

      return GatewayOrderStatus.PENDING;
    } catch {
      return GatewayOrderStatus.PENDING;
    }
  }

  /**
   * Fetches the captured payment ID from Cashfree order payments.
   * Used by reconciliation to get the exact gateway payment ID.
   */
  async fetchCapturedPaymentId(gatewayOrderId: string): Promise<string | null> {
    try {
      const response = await this.client.PGOrderFetchPayments(gatewayOrderId);
      const payments =
        (response.data as Array<{
          cf_payment_id?: string | number;
          payment_status?: string;
        }>) ?? [];

      const successful = payments.find((p) => p.payment_status === 'SUCCESS');

      return successful?.cf_payment_id
        ? String(successful.cf_payment_id)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Cashfree does not use client-side HMAC signatures for browser checkout.
   * Client-side verification is handled either via server-to-server webhook
   * or direct order status reconciliation.
   */
  verifySignature(_params: GatewayVerifyParams): boolean {
    return false;
  }
}

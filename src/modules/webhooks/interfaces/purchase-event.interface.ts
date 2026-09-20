import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
} from '@prisma/client';

import { PurchaseEventType } from '../enums/purchase-event-type.enum';

/**
 * A payment-gateway webhook normalised into a provider-neutral shape.
 *
 * Each gateway parser (RevenueCat today, Razorpay later) produces this, so
 * handlers and the transactions domain never learn a provider's field names.
 */
export interface ParsedPurchaseEvent {
  /** Which gateway delivered this event. */
  gateway: PaymentGateway;

  /** Normalised intent; handlers match on this. */
  type: PurchaseEventType;

  /** The provider's own event-type string, retained for logs and diagnostics. */
  providerEventType: string;

  /**
   * The provider's transaction identifier — the idempotency key. Null for
   * events that carry no transaction (e.g. RevenueCat's synthetic TEST event).
   */
  gatewayTransactionId: string | null;

  /** The provider's event identifier. Reused across retries, so never the dedupe key. */
  gatewayEventId: string | null;

  /** The user handle exactly as the gateway sent it. */
  gatewayUserId: string | null;

  /**
   * Every identifier the gateway associated with this customer — the primary
   * handle plus any aliases — in no guaranteed order. Resolution scans the whole
   * list because a purchase made before login is attributed to an anonymous ID
   * that the gateway only later aliases to the real one.
   */
  candidateUserIds: string[];

  /** Store product identifier (e.g. "likes_10"). */
  productId: string | null;

  environment: TransactionEnvironment;

  /** Originating client channel (IOS, ANDROID, WEB) where the purchase occurred. */
  channel: TransactionChannel | null;

  amount: number | null;
  currency: string | null;
  countryCode: string | null;

  /** When the purchase happened at the gateway. */
  occurredAt: Date;

  /** The untouched payload; sanitised of PII before persistence. */
  raw: Record<string, unknown>;
}

import {
  PaymentGateway,
  TransactionChannel,
  TransactionEnvironment,
} from '@prisma/client';

import { PurchaseEventType } from '../enums/purchase-event-type.enum';
import { RevenueCatEventType } from '../enums/revenuecat-event-type.enum';
import { ParsedPurchaseEvent } from '../interfaces/purchase-event.interface';

/**
 * Maps a RevenueCat event type onto the provider-neutral classification.
 *
 * Only `NON_RENEWING_PURCHASE` grants credits: the like packs are consumables,
 * and the subscription lifecycle types belong to the subscriptions module's own
 * store webhooks. `TEST` is explicitly not a purchase — its payload carries
 * `product_id: "test_product"`, which would otherwise fail the plan lookup.
 *
 * A lookup keyed by string rather than a switch, because the incoming value is
 * whatever the gateway sent: RevenueCat adds event types over time, and anything
 * unrecognised must fall through to UNKNOWN rather than fail to match.
 */
const EVENT_TYPE_CLASSIFICATION: Record<string, PurchaseEventType> = {
  [RevenueCatEventType.NON_RENEWING_PURCHASE]: PurchaseEventType.PURCHASE,
  [RevenueCatEventType.CANCELLATION]: PurchaseEventType.REFUND,
  [RevenueCatEventType.REFUND]: PurchaseEventType.REFUND,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Maps a RevenueCat store identifier onto our internal `TransactionChannel`.
 *
 * RevenueCat verifies incoming receipts directly against the underlying platform:
 * - Apple App Store / Mac App Store -> IOS
 * - Google Play Store / Amazon Appstore -> ANDROID
 * - Stripe / Web Billing (RC_BILLING) / External -> WEB
 *
 * Synthetic or sandbox stores (e.g. TEST_STORE, PROMOTIONAL) return null so they
 * do not skew channel metrics, unless resolved otherwise.
 */
function mapRevenueCatStoreToChannel(
  store: string | null,
): TransactionChannel | null {
  if (!store) return null;
  switch (store.toUpperCase()) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return TransactionChannel.IOS;
    case 'PLAY_STORE':
    case 'AMAZON':
      return TransactionChannel.ANDROID;
    case 'STRIPE':
    case 'RC_BILLING':
    case 'EXTERNAL':
      return TransactionChannel.WEB;
    default:
      return null;
  }
}

/**
 * Collects every identifier RevenueCat associated with the customer, primary
 * handle first, de-duplicated and stripped of empties.
 *
 * `original_app_user_id` is deliberately excluded from the priority position: on
 * a customer who purchased after logging in it holds the pre-login anonymous ID
 * (`$RCAnonymousID:...`), not the real one, so leading with it would fail to
 * resolve every such purchase. It still reaches the list via `aliases`.
 */
function collectCandidateUserIds(
  appUserId: string | null,
  aliases: string[],
): string[] {
  const candidates = appUserId ? [appUserId, ...aliases] : aliases;
  return Array.from(new Set(candidates.filter((value) => value.length > 0)));
}

/**
 * Normalises a RevenueCat webhook delivery into a `ParsedPurchaseEvent`.
 *
 * Reads the body defensively rather than trusting a validated DTO. The route
 * cannot run the application's strict validation pipe — it rejects unrecognised
 * properties, and RevenueCat adds them over time — so field extraction is the
 * only place the payload's shape is actually checked. A body that carries no
 * usable event is classified UNKNOWN and ignored, never thrown on: an exception
 * here would become a retried delivery for a payload that will never improve.
 *
 * @param payload - The raw webhook body.
 * @returns The provider-neutral event for handler dispatch.
 */
export function parseRevenueCatWebhook(payload: unknown): ParsedPurchaseEvent {
  const body = asRecord(payload);
  const event = asRecord(body?.event) ?? {};

  const eventType = asString(event.type);
  const appUserId = asString(event.app_user_id);

  // Fall back to the event timestamp when the store reports no purchase time,
  // so a transaction never lands without a usable occurrence date.
  const occurredAtMs =
    asNumber(event.purchased_at_ms) ?? asNumber(event.event_timestamp_ms);

  return {
    gateway: PaymentGateway.REVENUECAT,
    type: eventType
      ? (EVENT_TYPE_CLASSIFICATION[eventType] ?? PurchaseEventType.UNKNOWN)
      : PurchaseEventType.UNKNOWN,
    providerEventType: eventType ?? 'UNKNOWN',
    gatewayTransactionId: asString(event.transaction_id),
    gatewayEventId: asString(event.id),
    gatewayUserId: appUserId,
    candidateUserIds: collectCandidateUserIds(
      appUserId,
      asStringArray(event.aliases),
    ),
    productId: asString(event.product_id),
    environment:
      asString(event.environment) === 'PRODUCTION'
        ? TransactionEnvironment.PRODUCTION
        : TransactionEnvironment.SANDBOX,
    channel: mapRevenueCatStoreToChannel(asString(event.store)),
    amount: asNumber(event.price),
    currency: asString(event.currency),
    countryCode: asString(event.country_code),
    occurredAt: occurredAtMs ? new Date(occurredAtMs) : new Date(),
    raw: body ?? {},
  };
}

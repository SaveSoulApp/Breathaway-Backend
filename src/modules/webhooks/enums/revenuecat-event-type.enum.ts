/**
 * RevenueCat webhook event types we recognise by name.
 *
 * RevenueCat emits more types than this; anything absent here is normalised to
 * `PurchaseEventType.UNKNOWN` and ignored rather than treated as an error.
 */
export enum RevenueCatEventType {
  /** One-time consumable purchase — the event that grants like packs. */
  NON_RENEWING_PURCHASE = 'NON_RENEWING_PURCHASE',
  INITIAL_PURCHASE = 'INITIAL_PURCHASE',
  RENEWAL = 'RENEWAL',
  CANCELLATION = 'CANCELLATION',
  REFUND = 'REFUND',
  EXPIRATION = 'EXPIRATION',
  /** Synthetic event fired by the dashboard's "Send test webhook" button. */
  TEST = 'TEST',
}

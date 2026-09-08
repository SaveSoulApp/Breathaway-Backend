/**
 * Gateway-agnostic classification of an inbound purchase webhook.
 *
 * Provider-specific event names (RevenueCat's `NON_RENEWING_PURCHASE`, a future
 * Razorpay equivalent) are normalised to these by each provider's parser, so
 * handlers match on intent rather than on provider vocabulary.
 */
export enum PurchaseEventType {
  /** Money received; credits should be granted. */
  PURCHASE = 'PURCHASE',
  /** Money returned; recorded today, acted on when clawback ships. */
  REFUND = 'REFUND',
  /** Recognised payload, but not an event this system acts on. */
  UNKNOWN = 'UNKNOWN',
}

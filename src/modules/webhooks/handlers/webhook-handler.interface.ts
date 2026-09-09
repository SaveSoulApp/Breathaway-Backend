import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { ParsedPurchaseEvent } from '../interfaces/purchase-event.interface';

/**
 * The single contract every webhook handler implements, regardless of provider.
 *
 * Parameterised rather than fixed to one payload shape so a Meta message and a
 * RevenueCat purchase can share the same dispatch pattern — `canHandle` to claim
 * an event, `handle` to process it — while each handler still receives a fully
 * typed payload instead of a union it has to narrow by hand.
 *
 * Handlers are registered as composite arrays under a per-payload DI token
 * (see `webhooks.constants.ts`), so a Meta handler is never asked to evaluate a
 * purchase event and vice versa.
 */
export interface WebhookHandler<TPayload> {
  /** Whether this handler claims the given payload. */
  canHandle(payload: TPayload): boolean;

  /** Processes a payload this handler has claimed. */
  handle(payload: TPayload): Promise<void>;
}

/** Handlers for messages parsed out of a Meta (Instagram) webhook. */
export type WebhookMessageHandler = WebhookHandler<ParsedInstagramMessage>;

/** Handlers for purchase events parsed out of a payment gateway webhook. */
export type WebhookPurchaseHandler = WebhookHandler<ParsedPurchaseEvent>;

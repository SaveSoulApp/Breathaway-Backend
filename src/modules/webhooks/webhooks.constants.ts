/** Composite handlers for messages parsed out of a Meta (Instagram) webhook. */
export const WEBHOOK_MESSAGE_HANDLERS = 'WEBHOOK_MESSAGE_HANDLERS';

/**
 * Composite handlers for purchase events parsed out of a payment gateway webhook.
 *
 * Kept as a separate token from the message handlers so a Meta handler is never
 * asked to evaluate a purchase event, and each handler receives a payload it is
 * actually typed for.
 */
export const WEBHOOK_PURCHASE_HANDLERS = 'WEBHOOK_PURCHASE_HANDLERS';

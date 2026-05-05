/**
 * Enum representing the intent (type) of a Meta webhook event.
 *
 * As more webhook types are supported (e.g., reactions, story replies),
 * add new values here.
 */
export enum MetaWebhookIntent {
  /** A direct message was received */
  MESSAGE = 'MESSAGE',

  /** The webhook event type could not be determined */
  UNKNOWN = 'UNKNOWN',
}

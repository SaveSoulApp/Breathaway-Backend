import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';

/**
 * Represents a single parsed message extracted from a Meta webhook event.
 */
export interface ParsedInstagramMessage {
  /** Instagram-scoped ID of the sender */
  senderId: string;

  /** Instagram-scoped ID of the recipient (your page/account) */
  recipientId: string;

  /** Message ID assigned by Meta */
  messageId: string;

  /** The text content of the message */
  text: string;

  /** Unix timestamp (ms) of when the message was sent */
  timestamp: number;
}

/**
 * Result of parsing a Meta webhook payload.
 *
 * Contains the determined intent and any extracted data
 * corresponding to that intent.
 */
export interface MetaWebhookResult {
  /** The determined intent of the webhook event */
  intent: MetaWebhookIntent;

  /** The platform object type (e.g., "instagram") */
  platform: string;

  /** Entry ID (page/account ID) */
  entryId: string;

  /** Parsed messages — populated when intent is MESSAGE */
  messages: ParsedInstagramMessage[];
}

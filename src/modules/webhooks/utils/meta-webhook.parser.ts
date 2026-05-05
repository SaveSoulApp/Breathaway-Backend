import { MetaWebhookEntryDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';

/**
 * Determines the intent of a webhook entry by inspecting which
 * fields are present.
 */
export function determineIntent(entry: MetaWebhookEntryDto): MetaWebhookIntent {
  if (entry.messaging && entry.messaging.length > 0) {
    return MetaWebhookIntent.MESSAGE;
  }

  // Future: check for `changes`, `standby`, etc.
  return MetaWebhookIntent.UNKNOWN;
}

/**
 * Extracts structured message data from a webhook entry's
 * messaging events.
 */
export function extractMessages(
  entry: MetaWebhookEntryDto,
): ParsedInstagramMessage[] {
  if (!entry.messaging) {
    return [];
  }

  return entry.messaging.flatMap((event) => {
    if (!event.message?.text) {
      return [];
    }

    return [
      {
        senderId: event.sender.id,
        recipientId: event.recipient.id,
        messageId: event.message.mid,
        text: event.message.text,
        timestamp: event.timestamp,
      },
    ];
  });
}

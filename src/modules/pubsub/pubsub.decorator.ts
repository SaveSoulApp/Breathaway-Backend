import { SetMetadata } from '@nestjs/common';

export const PUBSUB_LISTENER_KEY = 'PUBSUB_LISTENER_KEY';

/**
 * Decorator to mark a method as a Pub/Sub event listener.
 * The ingestion controller will route matching event types to this method.
 *
 * @param eventType The specific event type to listen for (e.g., 'meta.webhook.received').
 */
export const PubSubListener = (eventType: string) =>
  SetMetadata(PUBSUB_LISTENER_KEY, eventType);

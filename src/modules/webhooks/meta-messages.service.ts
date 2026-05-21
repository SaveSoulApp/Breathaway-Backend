import { Injectable, Logger } from '@nestjs/common';
import { PubSubListener } from '../pubsub/pubsub.decorator';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{ id: string; [key: string]: unknown }>;
}

@Injectable()
export class MetaMessagesService {
  private readonly logger = new Logger(MetaMessagesService.name);

  /**
   * This handler is entirely pure. It only deals with parsed data and the message ID.
   * It is completely unaware of GCP Pub/Sub push mechanics, Base64 decoding, or HTTP routes.
   */
  @PubSubListener('meta.webhook.received')
  handleMetaWebhook(data: unknown, messageId: string): Promise<void> {
    this.logger.log(`Received Meta Webhook data for messageId ${messageId}`);

    const metaData = data as MetaWebhookPayload;
    // Domain-specific business logic goes here
    if (metaData.object === 'page' && Array.isArray(metaData.entry)) {
      for (const entry of metaData.entry) {
        // Process each entry
        this.logger.log(`Processing entry from page: ${entry.id}`);
      }
    }

    return Promise.resolve();
  }
}

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { PubSubEvent } from '../pubsub/enums';
import { PubSubListener } from '../pubsub/pubsub.decorator';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{ id: string; [key: string]: unknown }>;
}

@Injectable()
export class MetaMessagesService extends BaseService {
  constructor(logger: LoggerService) {
    super(logger);
  }

  /**
   * This handler is entirely pure. It only deals with parsed data and the message ID.
   * It is completely unaware of GCP Pub/Sub push mechanics, Base64 decoding, or HTTP routes.
   */
  @PubSubListener(PubSubEvent.META_WEBHOOK_RECEIVED)
  handleMetaWebhook(data: unknown, messageId: string): Promise<void> {
    this.logger.info(`Received Meta Webhook data for messageId ${messageId}`);

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

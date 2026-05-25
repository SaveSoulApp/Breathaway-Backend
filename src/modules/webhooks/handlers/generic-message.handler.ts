import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { WebhookMessageHandler } from './webhook-message.handler.interface';

@Injectable()
export class GenericMessageHandler implements WebhookMessageHandler {
  constructor(
    private readonly logger: LoggerService,
    private readonly pubsubPublisher: PubSubPublisherService,
  ) {}

  canHandle(message: ParsedInstagramMessage): boolean {
    return true; // Fallback handler handles everything that reaches it
  }

  async handle(message: ParsedInstagramMessage): Promise<void> {
    try {
      await this.pubsubPublisher.publish(
        PubSubTopic.META_WEBHOOKS,
        PubSubEvent.META_WEBHOOK_RECEIVED,
        {
          messageId: message.messageId,
          text: message.text,
          senderId: message.senderId,
          recipientId: message.recipientId,
          timestamp: message.timestamp,
        },
      );
      this.logger.log(
        `Published generic message event for message ${message.messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish generic message event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

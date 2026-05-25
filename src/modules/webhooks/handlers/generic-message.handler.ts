import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { WebhookMessageHandler } from './webhook-message.handler.interface';

@Injectable()
export class GenericMessageHandler
  extends BaseHandler
  implements WebhookMessageHandler
{
  constructor(
    logger: LoggerService,
    private readonly pubsubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  canHandle(message: ParsedInstagramMessage): boolean {
    this.logger.log(
      `Checking if generic message event for message ${message.messageId}`,
    );
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

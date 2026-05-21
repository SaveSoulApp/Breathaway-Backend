import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSub } from '@google-cloud/pubsub';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PubSubPublisherService extends BaseService {
  private pubsub: PubSub;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService
  ) {
    super(logger)
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    // Using default credentials or specific config if needed
    this.pubsub = new PubSub(projectId ? { projectId } : undefined);
  }

  /**
   * Publishes a structured message to a GCP Pub/Sub topic, ensuring the eventType attribute is set.
   *
   * @param topicName The GCP topic name.
   * @param eventType The custom event type (e.g., 'meta.webhook.received').
   * @param data The JSON-serializable payload.
   * @param attributes Optional additional string attributes.
   */
  async publish(
    topicName: string,
    eventType: string,
    data: Record<string, unknown>,
    attributes?: Record<string, string>,
  ): Promise<string> {
    const topic = this.pubsub.topic(topicName);

    const mergedAttributes = {
      ...attributes,
      eventType,
    };

    const dataBuffer = Buffer.from(JSON.stringify(data));

    try {
      const messageId = await topic.publishMessage({
        data: dataBuffer,
        attributes: mergedAttributes,
      });
      this.logger.debug(
        `Published event '${eventType}' to topic '${topicName}' with messageId: ${messageId}`,
      );
      return messageId;
    } catch (error) {
      this.logger.error(
        `Failed to publish event '${eventType}' to topic '${topicName}':`,
        error,
      );
      throw error;
    }
  }
}

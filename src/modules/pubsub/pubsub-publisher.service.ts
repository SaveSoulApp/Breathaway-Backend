import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSub } from '@google-cloud/pubsub';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound GCP Pub/Sub adapter responsible for serialising and publishing
 * application events to named topics.
 *
 * Initialised with the GCP project ID from `ConfigService` at construction
 * time; relies on Application Default Credentials (ADC) in deployed
 * environments and on service-account key files locally.
 */
@Injectable()
export class PubSubPublisherService extends BaseService {
  private pubsub: PubSub;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    // Using default credentials or specific config if needed
    this.pubsub = new PubSub(projectId ? { projectId } : undefined);
  }

  /**
   * Serialises `data` as JSON, encodes it to a Buffer, and publishes the
   * message to the given Pub/Sub topic with `eventType` always present in
   * the attributes map.
   *
   * The `eventType` attribute is mandatory because the ingestion controller
   * uses it to route messages to the correct @PubSubListener handler.
   *
   * @param topicName - GCP Pub/Sub topic name (not the full resource path).
   * @param eventType - Application-level event discriminator (e.g., `'meta.webhook.received'`).
   * @param data      - JSON-serialisable payload to attach as the message body.
   * @param attributes - Optional additional string key-value pairs merged into
   *                     the message attributes alongside `eventType`.
   * @returns The Pub/Sub message ID assigned by GCP upon successful publish.
   * @throws Re-throws any error from the GCP Pub/Sub client (e.g., topic not
   *   found, credential failure) after logging it.
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
        { error: error instanceof Error ? error.message : String(error) },
      );
      throw error;
    }
  }
}

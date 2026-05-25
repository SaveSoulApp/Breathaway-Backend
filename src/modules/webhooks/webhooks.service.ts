import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { MetaWebhookDto } from './dto';
import { MetaWebhookIntent } from './enums/meta-webhook-intent.enum';
import { MetaWebhookResult } from './interfaces/meta-webhook-result.interface';
import { determineIntent, extractMessages } from './utils/meta-webhook.parser';

@Injectable()
export class WebhooksService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly pubsubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  verifyMetaWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string> {
    const VERIFY_TOKEN = this.configService.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Meta webhook verified successfully');
      return Promise.resolve(challenge); // MUST return raw string
    }

    this.logger.warn('Meta webhook verification failed');
    return Promise.resolve('Verification failed');
  }

  /**
   * Parses an incoming Meta webhook payload, determines its intent,
   * and extracts relevant information.
   *
   * @param payload - The validated Meta webhook DTO
   * @returns An array of parsed webhook results (one per entry)
   */
  parseMetaWebhook(payload: MetaWebhookDto): MetaWebhookResult[] {
    const results: MetaWebhookResult[] = [];

    for (const entry of payload.entry) {
      const intent = determineIntent(entry);
      const messages =
        intent === MetaWebhookIntent.MESSAGE ? extractMessages(entry) : [];

      results.push({
        intent,
        platform: payload.object,
        entryId: entry.id,
        messages,
      });
    }

    return results;
  }

  /**
   * Handles the parsed webhook results by routing each intent
   * to the appropriate handler.
   *
   * @param results - Array of parsed webhook results
   */
  async handleMetaWebhookEvents(results: MetaWebhookResult[]): Promise<void> {
    for (const result of results) {
      switch (result.intent) {
        case MetaWebhookIntent.MESSAGE:
          await this.handleMessageIntent(result);
          break;

        case MetaWebhookIntent.UNKNOWN:
        default:
          this.logger.warn('Unhandled webhook intent', {
            intent: result.intent,
            entryId: result.entryId,
          });
          break;
      }
    }
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Handles MESSAGE intent events.
   * Extend this method with your business logic (e.g., store in DB,
   * trigger auto-replies, forward to AI, etc.)
   */
  private async handleMessageIntent(result: MetaWebhookResult): Promise<void> {
    for (const message of result.messages) {
      // 1. Logging
      this.logger.log('Instagram message received', {
        senderId: message.senderId,
        recipientId: message.recipientId,
        messageId: message.messageId,
        text: message.text,
        timestamp: new Date(message.timestamp).toISOString(),
      });

      // 2. Categorize and Publish Event
      const verifyRegex = /^verify:\s*(\S+)/i;
      const match = message.text.match(verifyRegex);

      if (match && match[1]) {
        const extractedOtp = match[1];

        try {
          await this.pubsubPublisher.publish(
            PubSubTopic.IDENTITY_WORKFLOWS,
            PubSubEvent.INSTAGRAM_OTP_RECEIVED,
            {
              otp: extractedOtp,
              senderId: message.senderId,
              timestamp: message.timestamp,
            },
          );
          this.logger.log(
            `Published OTP verification event for sender ${message.senderId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to publish OTP verification event: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        // Publish generic message received event for other downstreams
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
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { MetaWebhookDto } from './dto';
import { MetaWebhookIntent } from './enums/meta-webhook-intent.enum';
import { WebhookMessageHandler } from './handlers/webhook-message.handler.interface';
import { MetaWebhookResult } from './interfaces/meta-webhook-result.interface';
import { determineIntent, extractMessages } from './utils/meta-webhook.parser';
import { WEBHOOK_MESSAGE_HANDLERS } from './webhooks.constants';

@Injectable()
export class WebhooksService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    @Inject(WEBHOOK_MESSAGE_HANDLERS)
    private readonly messageHandlers: WebhookMessageHandler[],
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

      // 2. Delegate to Composite Handlers
      for (const handler of this.messageHandlers) {
        if (handler.canHandle(message)) {
          await handler.handle(message);
          break; // Stop at the first handler that processes the message
        }
      }
    }
  }
}

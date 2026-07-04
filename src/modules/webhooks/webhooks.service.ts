import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
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
    const ctx = { mode };
    this.logger.debug('Meta webhook verification started', {
      ...ctx,
      step: 'verify',
    });

    const VERIFY_TOKEN = this.configService.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Meta webhook verified successfully', {
        ...ctx,
        step: 'verify',
      });
      return Promise.resolve(challenge); // MUST return raw string
    }

    this.logger.warn('Meta webhook verification failed', {
      ...ctx,
      step: 'verify',
    });
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
      const ctx = {
        entryId: result.entryId,
        platform: result.platform,
        intent: result.intent,
      };

      switch (result.intent) {
        case MetaWebhookIntent.MESSAGE:
          await this.handleMessageIntent(result);
          break;

        case MetaWebhookIntent.UNKNOWN:
        default:
          this.logger.warn('Unhandled webhook intent', {
            ...ctx,
            step: 'intent_routing',
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
      const ctx = {
        senderId: message.senderId,
        recipientId: message.recipientId,
        messageId: message.messageId,
      };

      // 1. Logging (PII Compliant - text is not logged)
      this.logger.debug('Instagram message received', {
        ...ctx,
        step: 'receive_message',
        hasText: !!message.text,
        textLength: message.text?.length ?? 0,
        messageTimestamp: DateUtil.parse(message.timestamp).toISOString(),
      });

      // 2. Delegate to Composite Handlers
      for (const handler of this.messageHandlers) {
        if (handler.canHandle(message)) {
          try {
            await handler.handle(message);
          } catch (error) {
            this.logger.error('Failed to handle Instagram message', {
              ...ctx,
              step: 'handle_message',
              handler: handler.constructor.name,
              err: serializeError(error),
            });
            throw error;
          }
          break; // Stop at the first handler that processes the message
        }
      }
    }
  }
}

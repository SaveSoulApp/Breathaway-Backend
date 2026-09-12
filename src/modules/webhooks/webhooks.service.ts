import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';

import { MetaWebhookDto } from './dto';
import { MetaWebhookIntent } from './enums/meta-webhook-intent.enum';
import { PurchaseEventType } from './enums/purchase-event-type.enum';
import {
  WebhookMessageHandler,
  WebhookPurchaseHandler,
} from './handlers/webhook-handler.interface';
import { MetaWebhookResult } from './interfaces/meta-webhook-result.interface';
import { ParsedPurchaseEvent } from './interfaces/purchase-event.interface';
import { determineIntent, extractMessages } from './utils/meta-webhook.parser';
import { parseRevenueCatWebhook } from './utils/revenuecat-webhook.parser';
import {
  WEBHOOK_MESSAGE_HANDLERS,
  WEBHOOK_PURCHASE_HANDLERS,
} from './webhooks.constants';

@Injectable()
export class WebhooksService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    @Inject(WEBHOOK_MESSAGE_HANDLERS)
    private readonly messageHandlers: WebhookMessageHandler[],
    @Inject(WEBHOOK_PURCHASE_HANDLERS)
    private readonly purchaseHandlers: WebhookPurchaseHandler[],
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
      this.logger.event(LOG_EVENT.META_WEBHOOK_VERIFIED, {
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

  /**
   * Normalises a RevenueCat webhook delivery into a provider-neutral event.
   *
   * @param payload - The raw webhook body; shape is checked during parsing.
   * @returns The parsed purchase event.
   */
  parseRevenueCatWebhook(payload: unknown): ParsedPurchaseEvent {
    return parseRevenueCatWebhook(payload);
  }

  /**
   * Routes a parsed purchase event to the first handler that claims it.
   *
   * Events this system does not act on — subscription lifecycle types, and the
   * dashboard's synthetic `TEST` event — are logged and dropped rather than
   * treated as failures, so the gateway is never told to retry something that
   * will never be processed.
   *
   * @param event - The provider-neutral purchase event.
   */
  async handlePurchaseEvent(event: ParsedPurchaseEvent): Promise<void> {
    const ctx = {
      gateway: event.gateway,
      providerEventType: event.providerEventType,
      gatewayTransactionId: event.gatewayTransactionId,
      environment: event.environment,
    };

    if (event.type === PurchaseEventType.UNKNOWN) {
      this.logger.debug('Ignoring unhandled purchase event type', {
        ...ctx,
        step: 'event_routing',
      });
      return;
    }

    for (const handler of this.purchaseHandlers) {
      if (!handler.canHandle(event)) continue;

      try {
        await handler.handle(event);
      } catch (error) {
        this.logger.error('Failed to handle purchase event', {
          ...ctx,
          step: 'handle_purchase',
          handler: handler.constructor.name,
          err: serializeError(error),
        });
        throw error;
      }
      return; // Stop at the first handler that claims the event.
    }

    this.logger.warn('No handler claimed purchase event', {
      ...ctx,
      step: 'event_routing',
    });
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

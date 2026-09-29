import { Injectable } from '@nestjs/common';

import { serializeError } from '@common/utils/error.utils';
import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { WebhookMessageHandler } from './webhook-handler.interface';

@Injectable()
export class OtpVerificationHandler
  extends BaseHandler
  implements WebhookMessageHandler
{
  /**
   * Matches either:
   * 1. Legacy format: "verify: <token>" (e.g., "verify: 123456" or "verify: swift-golden-falcon")
   * 2. Natural language format: 3-word kebab slug embedded anywhere in conversational text (e.g., "swift-golden-falcon")
   *    Uses negative lookaround assertions to prevent matching subsets of longer hyphenated chains or URLs.
   */
  private readonly verificationRegex =
    /(?:verify:\s*([a-z0-9-]+)|(?<![a-z0-9-])([a-z]{2,25}-[a-z]{2,25}-[a-z]{2,25})(?![a-z0-9-]))/i;

  private readonly cachedMatches = new WeakMap<
    ParsedInstagramMessage,
    string
  >();

  constructor(
    logger: LoggerService,
    private readonly pubsubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  canHandle(message: ParsedInstagramMessage): boolean {
    if (!message?.text) {
      return false;
    }
    const extractedOtp = this.extractOtp(message.text);
    if (extractedOtp) {
      this.cachedMatches.set(message, extractedOtp);
      return true;
    }
    return false;
  }

  async handle(message: ParsedInstagramMessage): Promise<void> {
    if (!message?.text) {
      return;
    }

    const extractedOtp =
      this.cachedMatches.get(message) ?? this.extractOtp(message.text);
    if (!extractedOtp) {
      return;
    }
    this.cachedMatches.delete(message);

    const ctx = {
      senderId: message.senderId,
      step: 'publish_otp_event',
    };

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
      this.logger.debug(
        `Published OTP verification event for sender ${message.senderId}`,
        ctx,
      );
    } catch (error) {
      this.logger.error('Failed to publish OTP verification event', {
        ...ctx,
        err: serializeError(error),
      });
    }
  }

  private extractOtp(text: string): string | null {
    if (!text) {
      return null;
    }

    const match = text.match(this.verificationRegex);
    const rawOtp = match?.[1] || match?.[2];
    return rawOtp?.replace(/[.,;:!?]+$/, '').toLowerCase() || null;
  }
}

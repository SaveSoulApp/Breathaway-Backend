import { Injectable } from '@nestjs/common';

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
   */
  private readonly verificationRegex =
    /(?:verify:\s*([a-z0-9-]+)|\b([a-z]{2,25}-[a-z]{2,25}-[a-z]{2,25})\b)/i;

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
    return this.verificationRegex.test(message.text);
  }

  async handle(message: ParsedInstagramMessage): Promise<void> {
    if (!message?.text) {
      return;
    }

    const match = message.text.match(this.verificationRegex);
    const extractedOtp = (match?.[1] || match?.[2])?.toLowerCase();
    if (!extractedOtp) {
      return;
    }

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
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish OTP verification event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

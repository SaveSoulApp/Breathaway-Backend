import { BaseHandler } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { WebhookMessageHandler } from './webhook-message.handler.interface';

@Injectable()
export class OtpVerificationHandler
  extends BaseHandler
  implements WebhookMessageHandler
{
  private readonly verifyRegex = /^verify:\s*(\S+)/i;

  constructor(
    logger: LoggerService,
    private readonly pubsubPublisher: PubSubPublisherService,
  ) {
    super(logger);
  }

  canHandle(message: ParsedInstagramMessage): boolean {
    return this.verifyRegex.test(message.text);
  }

  async handle(message: ParsedInstagramMessage): Promise<void> {
    const match = message.text.match(this.verifyRegex);
    if (!match || !match[1]) {
      return;
    }

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
  }
}

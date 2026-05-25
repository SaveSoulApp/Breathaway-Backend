import { Injectable } from '@nestjs/common';
import { IdentityType } from '@prisma/client';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { IdentityService } from '@modules/identities/identities.service';
import { OtpService } from '@modules/one-time-passwords/one-time-passwords.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';
import { SocialidentityService } from '@modules/social-identities/social-identities.service';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{ id: string; [key: string]: unknown }>;
}

@Injectable()
export class MetaMessagesService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly otpService: OtpService,
    private readonly socialidentityService: SocialidentityService,
    private readonly identityService: IdentityService,
  ) {
    super(logger);
  }

  /**
   * This handler is entirely pure. It only deals with parsed data and the message ID.
   * It is completely unaware of GCP Pub/Sub push mechanics, Base64 decoding, or HTTP routes.
   */
  @PubSubListener(PubSubEvent.META_WEBHOOK_RECEIVED)
  handleMetaWebhook(data: unknown, messageId: string): Promise<void> {
    this.logger.info(`Received Meta Webhook data for messageId ${messageId}`);

    const metaData = data as MetaWebhookPayload;
    // Domain-specific business logic goes here
    if (metaData.object === 'page' && Array.isArray(metaData.entry)) {
      for (const entry of metaData.entry) {
        // Process each entry
        this.logger.log(`Processing entry from page: ${entry.id}`);
      }
    }

    return Promise.resolve();
  }

  @PubSubListener(PubSubEvent.INSTAGRAM_OTP_RECEIVED)
  async handleInstagramOtpReceived(
    data: { otp: string; senderId: string; timestamp: string },
    messageId: string,
  ): Promise<void> {
    this.logger.info(`Received Instagram OTP event for messageId ${messageId}`);

    const { otp: extractedOtp, senderId, timestamp } = data;

    try {
      this.logger.log(`OTP extracted: ${extractedOtp}. Verifying...`);
      // Note: verifyAndConsumeOtp automatically handles hashing the OTP
      const userId = await this.otpService.verifyAndConsumeOtp(extractedOtp);

      this.logger.log(
        `OTP verified successfully for userId: ${userId}. Fetching identity for senderId: ${senderId}`,
      );
      const identity =
        await this.socialidentityService.verifyInstagramIdentity(senderId);

      const username = identity.username;

      if (username) {
        this.logger.log(
          `Found Instagram username: ${username}. Linking identity to user ${userId}...`,
        );
        await this.identityService.claimOrCreateIdentity(
          IdentityType.INSTAGRAM,
          username,
          senderId,
          userId,
        );
        this.logger.log(
          `Successfully linked Instagram identity (${username}) to user (${userId}).`,
        );
        // TODO: take the next steps
      } else {
        this.logger.warn(
          `Could not extract a valid username from Instagram identity payload.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error during OTP verification flow for sender ${senderId}: ${(error as Error).message}`,
      );
    }
  }
}

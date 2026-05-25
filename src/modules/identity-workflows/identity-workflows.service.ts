import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { IdentityService } from '@modules/identities/identities.service';
import { OtpService } from '@modules/one-time-passwords/one-time-passwords.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';
import { SocialidentityService } from '@modules/social-identities/social-identities.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationPriority } from '@modules/notifications/enums/notification-priority.enum';
import { Injectable } from '@nestjs/common';
import { IdentityType } from '@prisma/client';

@Injectable()
export class IdentityWorkflowsService extends BaseService {
  constructor(
    logger: LoggerService,
    private readonly otpService: OtpService,
    private readonly socialidentityService: SocialidentityService,
    private readonly identityService: IdentityService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(logger);
  }

  @PubSubListener(PubSubEvent.INSTAGRAM_OTP_RECEIVED)
  async handleInstagramOtpReceived(
    data: { otp: string; senderId: string; timestamp: string },
    messageId: string,
  ): Promise<void> {
    this.logger.info(`Received Instagram OTP event for messageId ${messageId}`);

    const { otp: extractedOtp, senderId } = data;

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
        this.notificationsService
          .dispatch({
            userIds: [userId],
            channels: [NotificationChannel.PUSH],
            title: 'Identity Claimed',
            body: `Your Instagram identity (${username}) has been successfully linked to your account.`,
            type: NotificationType.SYSTEM_ALERT,
            category: NotificationCategory.SYSTEM,
            priority: NotificationPriority.HIGH,
          })
          .catch((err) => {
            this.logger.error(
              `Failed to dispatch identity claimed notification for user ${userId}`,
              { error: err instanceof Error ? err.message : String(err) },
            );
          });

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

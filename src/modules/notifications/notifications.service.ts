import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device } from '@prisma/client';
import { SendNotificationRequestDto } from './dto/request/send-notification.request.dto';
import { EmailService } from './email/email.service';
import { EmailType } from './enums/email-type.enum';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationType } from './enums/notification-type.enum';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';
import { PreferencesService } from '@modules/preferences/preferences.service';

/**
 * Maps a push NotificationType to the corresponding EmailType for template selection.
 * Only types that have a corresponding email template need to be listed here.
 */
const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Partial<
  Record<NotificationType, EmailType>
> = {
  [NotificationType.NEW_MATCH]: EmailType.NEW_MATCH,
  [NotificationType.NEW_MESSAGE]: EmailType.NEW_MESSAGE,
  [NotificationType.CREDIT_UPDATE]: EmailType.CREDIT_UPDATE,
  [NotificationType.SYSTEM_ALERT]: EmailType.SYSTEM_ALERT,
};

@Injectable()
export class NotificationsService extends BaseService {
  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pubSubPublisherService: PubSubPublisherService,
    private readonly fcmProvider: FcmProviderService,
    private readonly emailService: EmailService,
    private readonly whatsAppProvider: WhatsAppProviderService,
    private readonly preferencesService: PreferencesService,
  ) {
    super(loggerService);
  }

  /**
   * Dispatches the notification request to Pub/Sub for asynchronous processing.
   */
  async dispatch(dto: SendNotificationRequestDto): Promise<void> {
    const topicName =
      this.configService.get<string>('PUBSUB_NOTIFICATIONS_TOPIC') ||
      'notifications';

    try {
      await this.pubSubPublisherService.publish(
        topicName,
        PubSubEvent.NOTIFICATION_SEND_REQUESTED,
        dto as unknown as Record<string, unknown>,
      );
      this.logger.log(
        `Dispatched notification request for ${dto.userIds.length} users`,
      );
    } catch (error) {
      this.logger.error('Failed to dispatch notification request to Pub/Sub:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Pub/Sub listener that actually processes the send request.
   */
  @PubSubListener(PubSubEvent.NOTIFICATION_SEND_REQUESTED)
  async processSendRequest(dto: SendNotificationRequestDto): Promise<void> {
    this.logger.log(
      `Processing notification request for ${dto.userIds?.length || 0} users`,
    );

    if (!dto.userIds || dto.userIds.length === 0) {
      return;
    }

    const channels = dto.channels as NotificationChannel[];
    const promises: Promise<void>[] = [];

    // Fetch preferences for all users in bulk
    const preferencesMap = await this.preferencesService.getPreferencesMany(
      dto.userIds,
    );

    // 1. Fetch devices if PUSH is requested
    let devices: Device[] = [];
    if (channels.includes(NotificationChannel.PUSH)) {
      const pushEnabledUserIds = dto.userIds.filter(
        (userId) => preferencesMap.get(userId)?.pushEnabled,
      );

      if (pushEnabledUserIds.length > 0) {
        devices = await this.prisma.device.findMany({
          where: {
            userId: { in: pushEnabledUserIds },
            isActive: true,
          },
        });
        promises.push(this.fcmProvider.send(dto, devices));
      }
    }

    // 2. Route to Email service if requested — resolves template from NotificationType mapping
    if (channels.includes(NotificationChannel.EMAIL)) {
      const emailEnabledUserIds = dto.userIds.filter(
        (userId) => preferencesMap.get(userId)?.emailEnabled,
      );

      if (emailEnabledUserIds.length > 0) {
        const emailType = NOTIFICATION_TYPE_TO_EMAIL_TYPE[dto.type];
        if (emailType) {
          promises.push(
            this.emailService.send({
              emailType,
              userIds: emailEnabledUserIds,
              templateData: {
                ...(dto.payload ?? {}),
                appUrl: this.configService.get<string>('APP_URL') ?? '',
                currentYear: new Date().getFullYear(),
              },
            }),
          );
        } else {
          this.logger.warn(
            `No email template mapped for NotificationType: ${dto.type} — skipping email channel`,
          );
        }
      }
    }

    // 3. Route to WhatsApp provider if requested
    if (channels.includes(NotificationChannel.WHATSAPP)) {
      const whatsappEnabledUserIds = dto.userIds.filter(
        (userId) => preferencesMap.get(userId)?.whatsappEnabled,
      );

      if (whatsappEnabledUserIds.length > 0) {
        // Clone the dto and override userIds with only the enabled ones
        const whatsappDto = { ...dto, userIds: whatsappEnabledUserIds };
        promises.push(this.whatsAppProvider.send(whatsappDto));
      }
    }

    // Await all provider responses concurrently
    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(`Notification provider at index ${index} failed:`, {
          error: result.reason,
        });
      }
    });
  }
}

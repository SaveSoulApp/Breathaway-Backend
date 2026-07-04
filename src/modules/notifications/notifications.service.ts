import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device } from '@prisma/client';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PreferencesService } from '@modules/preferences/preferences.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';

import { SendNotificationRequestDto } from './dto/request/send-notification.request.dto';
import { EmailService } from './email/email.service';
import { EmailType } from './enums/email-type.enum';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationType } from './enums/notification-type.enum';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';
import { PUSH_TEMPLATE_MAP } from './push-template.registry';

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
  [NotificationType.BUNDLE_EXPIRY_WARNING]: EmailType.BUNDLE_EXPIRY_WARNING,
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
      'notifications-stream';

    const ctx = {
      notificationType: dto.type,
      userCount: dto.userIds?.length ?? 0,
    };

    this.logger.log('Dispatching notification request to Pub/Sub', {
      ...ctx,
      step: 'init',
    });

    try {
      await this.pubSubPublisherService.publish(
        topicName,
        PubSubEvent.NOTIFICATION_SEND_REQUESTED,
        dto as unknown as Record<string, unknown>,
      );

      this.logger.debug('Notification request published to Pub/Sub', {
        ...ctx,
        step: 'publish',
      });

      this.logger.log('Notification request dispatched successfully', {
        ...ctx,
        step: 'complete',
      });
    } catch (error) {
      this.logger.error('Failed to dispatch notification request to Pub/Sub', {
        ...ctx,
        step: 'publish',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Pub/Sub listener that actually processes the send request.
   */
  @PubSubListener(PubSubEvent.NOTIFICATION_SEND_REQUESTED)
  async processSendRequest(dto: SendNotificationRequestDto): Promise<void> {
    const ctx = {
      notificationType: dto.type,
      userCount: dto.userIds?.length ?? 0,
    };

    this.logger.log('Processing notification request', {
      ...ctx,
      step: 'init',
    });

    if (!dto.userIds || dto.userIds.length === 0) {
      this.logger.log('Notification request processing completed (no users)', {
        ...ctx,
        step: 'complete',
      });
      return;
    }

    const channels = dto.channels as NotificationChannel[];
    const promises: Promise<void>[] = [];

    // Interpolate title and body from push templates if missing
    const pushTemplateConfig = PUSH_TEMPLATE_MAP[dto.type];
    if (pushTemplateConfig) {
      if (!dto.title && pushTemplateConfig.title) {
        dto.title = pushTemplateConfig.title(dto.payload ?? {});
      }
      if (!dto.body && pushTemplateConfig.body) {
        dto.body = pushTemplateConfig.body(dto.payload ?? {});
      }
    }

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
          this.logger.warn('No email template mapped, skipping email channel', {
            ...ctx,
            step: 'email_routing',
          });
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
        this.logger.error('Notification provider failed', {
          ...ctx,
          step: 'provider_dispatch',
          providerIndex: index,
          err: serializeError(result.reason),
        });
      } else {
        this.logger.debug('Notification provider succeeded', {
          ...ctx,
          step: 'provider_dispatch',
          providerIndex: index,
        });
      }
    });

    this.logger.log('Notification request processing completed', {
      ...ctx,
      step: 'complete',
    });
  }
}

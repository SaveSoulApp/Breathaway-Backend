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
import { NotificationChannel } from './enums/notification-channel.enum';
import { EmailProviderService } from './providers/email.provider.service';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';

@Injectable()
export class NotificationsService extends BaseService {
  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pubSubPublisherService: PubSubPublisherService,
    private readonly fcmProvider: FcmProviderService,
    private readonly emailProvider: EmailProviderService,
    private readonly whatsAppProvider: WhatsAppProviderService,
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

    // The DTO validation ensures channels and userIds are present
    const channels = dto.channels as NotificationChannel[];
    const promises: Promise<void>[] = [];

    // 1. Fetch devices if PUSH is requested
    let devices: Device[] = [];
    if (channels.includes(NotificationChannel.PUSH)) {
      devices = await this.prisma.device.findMany({
        where: {
          userId: { in: dto.userIds },
          isActive: true,
        },
      });
      promises.push(this.fcmProvider.send(dto, devices));
    }

    // 2. Route to Email provider if requested
    if (channels.includes(NotificationChannel.EMAIL)) {
      promises.push(this.emailProvider.send(dto));
    }

    // 3. Route to WhatsApp provider if requested
    if (channels.includes(NotificationChannel.WHATSAPP)) {
      promises.push(this.whatsAppProvider.send(dto));
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

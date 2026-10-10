import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification, Prisma } from '@prisma/client';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PreferencesService } from '@modules/preferences/preferences.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubListener } from '@modules/pubsub/pubsub.decorator';

import {
  BatchReadResponseDto,
  GetNotificationsRequestDto,
  NotificationResponseDto,
  PaginatedNotificationsResponseDto,
  SendNotificationRequestDto,
  UnreadCountResponseDto,
} from './dto';
import { EmailService } from './email/email.service';
import { EmailType } from './enums/email-type.enum';
import { NotificationCategory } from './enums/notification-category.enum';
import { NotificationChannel } from './enums/notification-channel.enum';
import { NotificationPriority } from './enums/notification-priority.enum';
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
  [NotificationType.WELCOME]: EmailType.WELCOME,
  [NotificationType.LIKE_SENT]: EmailType.LIKE_SENT,
  [NotificationType.NEW_MATCH]: EmailType.NEW_MATCH,
  [NotificationType.NEW_MESSAGE]: EmailType.NEW_MESSAGE,
  [NotificationType.CREDIT_UPDATE]: EmailType.CREDIT_UPDATE,
  [NotificationType.CREDITS_PURCHASED]: EmailType.CREDITS_PURCHASED,
  [NotificationType.SYSTEM_ALERT]: EmailType.SYSTEM_ALERT,
  [NotificationType.BUNDLE_EXPIRY_WARNING]: EmailType.BUNDLE_EXPIRY_WARNING,
  [NotificationType.LIKES_EXPIRED]: EmailType.LIKES_EXPIRED,
  [NotificationType.IDENTITY_ADDED]: EmailType.IDENTITY_ADDED,
  [NotificationType.IDENTITY_REMOVED]: EmailType.IDENTITY_REMOVED,
  [NotificationType.CREDITS_USED]: EmailType.CREDITS_USED,
  [NotificationType.DEVICE_ADDED]: EmailType.DEVICE_ADDED,
  [NotificationType.LIKE_WITHDRAWN]: EmailType.LIKE_WITHDRAWN,
  [NotificationType.PAYMENT_COMPLETED]: EmailType.CREDITS_PURCHASED,
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
    private readonly identityCryptoService: IdentityCryptoService,
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

      this.logger.event(LOG_EVENT.NOTIFICATION_QUEUED, {
        ...ctx,
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

    // 1. Resolve recipient details & interpolate templates
    await this.enrichRecipientProfile(dto);
    this.interpolateContent(dto);

    // 2. Fetch preferences for all users in bulk
    const preferencesMap = await this.preferencesService.getPreferencesMany(
      dto.userIds,
    );

    const channels = dto.channels ?? [NotificationChannel.PUSH];

    const hasPushContent = Boolean(dto.title?.trim() || dto.body?.trim());
    const shouldDispatchPush =
      channels.includes(NotificationChannel.PUSH) && hasPushContent;

    if (channels.includes(NotificationChannel.PUSH) && !hasPushContent) {
      this.logger.warn(
        'Push notification omitted: both title and body are empty',
        {
          ...ctx,
          step: 'validate_content',
        },
      );
    }

    let userNotificationIdMap: Map<string, string> | undefined;

    // 3. Persist notification in DB (Source of Truth) for push-bound communications
    if (shouldDispatchPush) {
      userNotificationIdMap = await this.persistNotifications(dto);
    }

    const promises: Promise<void>[] = [];

    // 4. Delegate to individual channel dispatchers
    if (shouldDispatchPush) {
      promises.push(
        this.sendPushNotification(dto, preferencesMap, userNotificationIdMap),
      );
    }

    if (channels.includes(NotificationChannel.EMAIL)) {
      promises.push(this.sendEmailNotification(dto, preferencesMap, ctx));
    }

    if (channels.includes(NotificationChannel.WHATSAPP)) {
      promises.push(this.sendWhatsAppNotification(dto, preferencesMap));
    }

    // 5. Concurrently await all channel dispatches
    await this.awaitChannelDispatches(promises, ctx);

    this.logger.event(LOG_EVENT.NOTIFICATION_SENT, {
      ...ctx,
    });
  }

  /**
   * Auto-resolves recipient firstName from UserProfile if not explicitly provided.
   */
  private async enrichRecipientProfile(
    dto: SendNotificationRequestDto,
  ): Promise<void> {
    if (!dto.payload?.name && dto.userIds?.length === 1) {
      try {
        const profile = await this.prisma.userProfile.findUnique({
          where: { userId: dto.userIds[0] },
          select: { firstName: true },
        });
        if (profile?.firstName) {
          const decryptedName = await this.identityCryptoService.decryptText(
            profile.firstName,
          );
          dto.payload = {
            ...(dto.payload ?? {}),
            name: decryptedName ?? profile.firstName,
          };
        }
      } catch (err) {
        this.logger.warn(
          'Failed to auto-resolve user profile for notification',
          {
            notificationType: dto.type,
            step: 'resolve_profile',
            err: serializeError(err),
          },
        );
      }
    }
  }

  /**
   * Synchronizes deep links and interpolates title and body from push templates.
   */
  private interpolateContent(dto: SendNotificationRequestDto): void {
    if (!dto.link && typeof dto.payload?.link === 'string') {
      dto.link = dto.payload.link;
    } else if (dto.link && !dto.payload?.link) {
      dto.payload = { ...(dto.payload ?? {}), link: dto.link };
    }

    const pushTemplateConfig = PUSH_TEMPLATE_MAP[dto.type];
    if (pushTemplateConfig) {
      if (!dto.title && pushTemplateConfig.title) {
        dto.title = pushTemplateConfig.title(dto.payload ?? {});
      }
      if (!dto.body && pushTemplateConfig.body) {
        dto.body = pushTemplateConfig.body(dto.payload ?? {});
      }
    }
  }

  /**
   * Dispatches notifications via the PUSH channel:
   * Persists record to DB, filters by preference, fetches devices, and sends via FCM.
   */
  private async sendPushNotification(
    dto: SendNotificationRequestDto,
    preferencesMap: Map<string, { pushEnabled?: boolean }>,
    userNotificationIdMap?: Map<string, string>,
  ): Promise<void> {
    const pushEnabledUserIds = dto.userIds.filter(
      (userId) => preferencesMap.get(userId)?.pushEnabled,
    );

    if (pushEnabledUserIds.length > 0) {
      const devices = await this.prisma.device.findMany({
        where: {
          userId: { in: pushEnabledUserIds },
          isActive: true,
        },
      });
      await this.fcmProvider.send(dto, devices, userNotificationIdMap);
    }
  }

  /**
   * Dispatches notifications via the EMAIL channel:
   * Filters by preference, resolves email template, and sends via EmailService.
   */
  private async sendEmailNotification(
    dto: SendNotificationRequestDto,
    preferencesMap: Map<string, { emailEnabled?: boolean }>,
    ctx: Record<string, unknown>,
  ): Promise<void> {
    const emailEnabledUserIds = dto.userIds.filter(
      (userId) => preferencesMap.get(userId)?.emailEnabled,
    );

    if (emailEnabledUserIds.length === 0) {
      return;
    }

    const emailType = NOTIFICATION_TYPE_TO_EMAIL_TYPE[dto.type];
    if (!emailType) {
      this.logger.warn('No email template mapped, skipping email channel', {
        ...ctx,
        step: 'email_routing',
      });
      return;
    }

    const appUrl = (
      this.configService.get<string>('APP_URL') ?? 'https://www.breathaway.app'
    ).replace(/\/+$/, '');
    const logoUrl =
      this.configService.get<string>('EMAIL_LOGO_URL') ||
      'https://okrhhvapirxwelcqfbhi.supabase.co/storage/v1/object/public/public-assets/logo/breathaway-wordmark.png';

    await this.emailService.send({
      emailType,
      userIds: emailEnabledUserIds,
      templateData: {
        ...(dto.payload ?? {}),
        appUrl,
        logoUrl,
        currentYear: DateUtil.now().getFullYear(),
      },
      recipientData: dto.recipientData,
    });
  }

  /**
   * Dispatches notifications via the WHATSAPP channel:
   * Filters by preference and sends via WhatsAppProviderService.
   */
  private async sendWhatsAppNotification(
    dto: SendNotificationRequestDto,
    preferencesMap: Map<string, { whatsappEnabled?: boolean }>,
  ): Promise<void> {
    const whatsappEnabledUserIds = dto.userIds.filter(
      (userId) => preferencesMap.get(userId)?.whatsappEnabled,
    );

    if (whatsappEnabledUserIds.length === 0) {
      return;
    }

    const whatsappDto = { ...dto, userIds: whatsappEnabledUserIds };
    await this.whatsAppProvider.send(whatsappDto);
  }

  /**
   * Concurrently awaits all channel promises with Promise.allSettled and logs errors.
   */
  private async awaitChannelDispatches(
    promises: Promise<void>[],
    ctx: Record<string, unknown>,
  ): Promise<void> {
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
  }

  /**
   * Persists the notification record to PostgreSQL for each recipient.
   * Only invoked when the notification is designated for the PUSH channel.
   * Returns a map of userId -> notificationId.
   */
  private async persistNotifications(
    dto: SendNotificationRequestDto,
  ): Promise<Map<string, string>> {
    const ctx = {
      notificationType: dto.type,
      userCount: dto.userIds.length,
    };

    const idMap = new Map<string, string>();

    try {
      const priority = dto.priority ?? NotificationPriority.NORMAL;
      const title = dto.title ?? '';
      const body = dto.body ?? '';
      const link = dto.link ?? null;
      const action =
        (dto.payload?.action as string | undefined) ??
        (link ? 'NAVIGATE' : null);
      const data = (dto.payload ?? {}) as Prisma.InputJsonValue;

      if (dto.userIds.length === 1) {
        const userId = dto.userIds[0];
        const record = await this.prisma.notification.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            userId,
            type: dto.type,
            category: dto.category,
            priority,
            title,
            body,
            link,
            action,
            data,
            isRead: false,
            isDismissed: false,
          },
        });

        // Enrich dto.id with the persisted record's ID so push notification payload carries it
        dto.id = record.id;
        idMap.set(userId, record.id);
      } else {
        const records = await this.prisma.notification.createManyAndReturn({
          data: dto.userIds.map((userId) => ({
            userId,
            type: dto.type,
            category: dto.category,
            priority,
            title,
            body,
            link,
            action,
            data,
            isRead: false,
            isDismissed: false,
          })),
          select: { id: true, userId: true },
        });

        records.forEach((record) => {
          idMap.set(record.userId, record.id);
        });
      }

      this.logger.debug('Notifications persisted to database', {
        ...ctx,
        step: 'persist_notifications',
      });

      return idMap;
    } catch (error) {
      this.logger.error('Failed to persist notifications to database', {
        ...ctx,
        step: 'persist_notifications',
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Fetches the authenticated user's notification inbox feed with cursor-based pagination.
   */
  async getUserNotifications(
    userId: string,
    query: GetNotificationsRequestDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    const { limit = 20, cursor, category, unreadOnly } = query;

    const where: Prisma.NotificationWhereInput = {
      userId,
      isDismissed: false,
      ...(category ? { category } : {}),
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const shouldFetchUnreadCount = !cursor;

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      shouldFetchUnreadCount
        ? this.prisma.notification.count({
            where: {
              userId,
              isRead: false,
              isDismissed: false,
            },
          })
        : Promise.resolve(undefined),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items: items.map((item) => this.mapToNotificationResponseDto(item)),
      nextCursor,
      hasMore,
      ...(unreadCount !== undefined ? { unreadCount } : {}),
    };
  }

  /**
   * Returns the count of unread notifications for the given user.
   */
  async getUnreadCount(userId: string): Promise<UnreadCountResponseDto> {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
        isDismissed: false,
      },
    });

    return { unreadCount: count };
  }

  /**
   * Marks a specific notification as read by the user.
   */
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
        isDismissed: false,
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Notification with ID "${notificationId}" was not found`,
      );
    }

    if (existing.isRead) {
      return this.mapToNotificationResponseDto(existing);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.mapToNotificationResponseDto(updated);
  }

  /**
   * Maps a raw Prisma Notification entity to its standardized client response DTO.
   */
  private mapToNotificationResponseDto(
    item: Notification,
  ): NotificationResponseDto {
    return {
      id: item.id,
      userId: item.userId,
      type: item.type as NotificationType,
      category: item.category as NotificationCategory,
      priority: item.priority as NotificationPriority,
      title: item.title,
      body: item.body,
      action: item.action,
      link: item.link,
      data: item.data as Record<string, unknown> | null,
      isRead: item.isRead,
      readAt: item.readAt,
      createdAt: item.createdAt,
    };
  }

  /**
   * Marks all unread notifications as read for the given user.
   */
  async markAllAsRead(userId: string): Promise<BatchReadResponseDto> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        isDismissed: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updatedCount: result.count };
  }

  /**
   * Dismisses a notification from the user's active inbox view.
   */
  async dismissNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        isDismissed: false,
      },
      data: { isDismissed: true },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        `Notification with ID "${notificationId}" was not found`,
      );
    }
  }
}

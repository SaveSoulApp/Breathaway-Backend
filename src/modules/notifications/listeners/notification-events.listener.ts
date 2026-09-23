import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { USER_WELCOME_EVENT, UserWelcomeEvent } from '@modules/auth/events';
import {
  CREDIT_BUNDLE_EXPIRING_EVENT,
  CREDITS_PURCHASED_EVENT,
  CREDITS_USED_EVENT,
  CreditBundleExpiringEvent,
  CreditsPurchasedEvent,
  CreditsUsedEvent,
} from '@modules/credits/events';
import { DEVICE_ADDED_EVENT, DeviceAddedEvent } from '@modules/devices/events';
import {
  IDENTITY_ADDED_EVENT,
  IDENTITY_REMOVED_EVENT,
  IdentityAddedEvent,
  IdentityRemovedEvent,
} from '@modules/identities/events';
import {
  LIKE_SENT_EVENT,
  LIKE_WITHDRAWN_EVENT,
  LikeSentEvent,
  LikeWithdrawnEvent,
} from '@modules/likes/events';
import {
  LIKES_EXPIRED_EVENT,
  LikesExpiredEvent,
} from '@modules/maintenance/events';
import {
  MATCH_CREATED_EVENT,
  MatchCreatedEvent,
} from '@modules/match-resolver/events';

import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';

/**
 * Central event listener that subscribes to domain events and dispatches notifications.
 *
 * Decouples domain services (Devices, Likes, Identities, Auth, Credits, MatchResolver, Maintenance)
 * from notification channel orchestration and user profile resolution.
 */
@Injectable()
export class NotificationEventsListener extends BaseService {
  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(loggerService);
  }

  /**
   * Resolves the user's first name from UserProfile for greeting copy.
   */
  private async resolveUserFirstName(userId: string): Promise<string> {
    try {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { firstName: true },
      });
      return profile?.firstName ?? '';
    } catch {
      return '';
    }
  }

  @OnEvent(DEVICE_ADDED_EVENT)
  async handleDeviceAdded(event: DeviceAddedEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.DEVICE_ADDED,
        category: NotificationCategory.SYSTEM,
        priority: NotificationPriority.HIGH,
        payload: {
          name,
          platform: event.platform,
          deviceId: event.deviceId ?? '',
          appVersion: event.appVersion ?? '',
          addedAt: DateUtil.now().toUTCString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch DEVICE_ADDED notification', {
        userId: event.userId,
        step: 'handle_device_added_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(LIKE_SENT_EVENT)
  async handleLikeSent(event: LikeSentEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.LIKE_SENT,
        category: NotificationCategory.SOCIAL,
        payload: {
          name,
          targetMaskedValue: event.targetMaskedValue,
          targetLabel: event.targetLabel ?? null,
          intent: event.intent,
          expiresAt: event.expiresAt
            ? event.expiresAt.toISOString().slice(0, 10)
            : '',
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch LIKE_SENT notification', {
        userId: event.userId,
        step: 'handle_like_sent_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(LIKE_WITHDRAWN_EVENT)
  async handleLikeWithdrawn(event: LikeWithdrawnEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.LIKE_WITHDRAWN,
        category: NotificationCategory.SOCIAL,
        payload: {
          name,
          targetMaskedValue: event.targetMaskedValue,
          targetLabel: event.targetLabel ?? null,
          withdrawnAt: DateUtil.now().toUTCString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch LIKE_WITHDRAWN notification', {
        userId: event.userId,
        step: 'handle_like_withdrawn_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(MATCH_CREATED_EVENT)
  async handleMatchCreated(event: MatchCreatedEvent): Promise<void> {
    try {
      const profiles = await this.prisma.userProfile.findMany({
        where: { userId: { in: [event.userOneId, event.userTwoId] } },
        select: { userId: true, firstName: true },
      });

      const userOneName =
        profiles.find((p) => p.userId === event.userOneId)?.firstName ??
        'someone';
      const userTwoName =
        profiles.find((p) => p.userId === event.userTwoId)?.firstName ??
        'someone';

      const userOneDisplayName =
        event.likeOneLabel && event.likeOneLabel.trim() !== ''
          ? event.likeOneLabel
          : userTwoName;
      const userTwoDisplayName =
        event.likeTwoLabel && event.likeTwoLabel.trim() !== ''
          ? event.likeTwoLabel
          : userOneName;

      // Dispatch for User One
      await this.notificationsService.dispatch({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: [event.userOneId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        payload: {
          name: userOneName,
          matchName: userOneDisplayName,
          matchId: event.matchId,
          chatUrl: `/matches/${event.matchId}`,
        },
      });

      // Dispatch for User Two
      await this.notificationsService.dispatch({
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
        userIds: [event.userTwoId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        payload: {
          name: userTwoName,
          matchName: userTwoDisplayName,
          matchId: event.matchId,
          chatUrl: `/matches/${event.matchId}`,
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch match notifications', {
        matchId: event.matchId,
        userOneId: event.userOneId,
        userTwoId: event.userTwoId,
        step: 'handle_match_created_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(IDENTITY_ADDED_EVENT)
  async handleIdentityAdded(event: IdentityAddedEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.IDENTITY_ADDED,
        category: NotificationCategory.SYSTEM,
        priority: NotificationPriority.HIGH,
        payload: {
          name,
          identityType: event.identityType,
          maskedValue: event.maskedValue,
          addedAt: DateUtil.now().toUTCString(),
          isVerified: event.isVerified,
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch IDENTITY_ADDED notification', {
        userId: event.userId,
        identityType: event.identityType,
        step: 'handle_identity_added_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(IDENTITY_REMOVED_EVENT)
  async handleIdentityRemoved(event: IdentityRemovedEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.IDENTITY_REMOVED,
        category: NotificationCategory.SYSTEM,
        priority: NotificationPriority.HIGH,
        payload: {
          name,
          identityType: event.identityType,
          maskedValue: event.maskedValue,
          removedAt: DateUtil.now().toUTCString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch IDENTITY_REMOVED notification', {
        userId: event.userId,
        identityType: event.identityType,
        step: 'handle_identity_removed_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(USER_WELCOME_EVENT)
  async handleUserWelcome(event: UserWelcomeEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL],
        userIds: [event.userId],
        type: NotificationType.WELCOME,
        category: NotificationCategory.SYSTEM,
        payload: {
          name,
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch WELCOME notification', {
        userId: event.userId,
        step: 'handle_user_welcome_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(CREDITS_PURCHASED_EVENT)
  async handleCreditsPurchased(event: CreditsPurchasedEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.CREDITS_PURCHASED,
        category: NotificationCategory.SYSTEM,
        payload: {
          name,
          creditsAdded: Math.abs(event.amount),
          creditBalance: event.balance,
          transactionId: event.referenceId ?? '',
          expiresAt: event.expiresAt
            ? event.expiresAt.toISOString().slice(0, 10)
            : '',
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch CREDITS_PURCHASED notification', {
        userId: event.userId,
        step: 'handle_credits_purchased_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(CREDITS_USED_EVENT)
  async handleCreditsUsed(event: CreditsUsedEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.CREDITS_USED,
        category: NotificationCategory.SYSTEM,
        payload: {
          name,
          creditsUsed: event.amount,
          creditBalance: event.balance,
          usedAt: DateUtil.now().toUTCString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch CREDITS_USED notification', {
        userId: event.userId,
        step: 'handle_credits_used_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(LIKES_EXPIRED_EVENT)
  async handleLikesExpired(event: LikesExpiredEvent): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.LIKES_EXPIRED,
        category: NotificationCategory.SYSTEM,
        payload: {
          name,
          count: event.count,
          expiryDate: event.expiryDate,
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch LIKES_EXPIRED notification', {
        userId: event.userId,
        step: 'handle_likes_expired_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(CREDIT_BUNDLE_EXPIRING_EVENT)
  async handleCreditBundleExpiring(
    event: CreditBundleExpiringEvent,
  ): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.BUNDLE_EXPIRY_WARNING,
        category: NotificationCategory.SYSTEM,
        payload: {
          name,
          count: event.count,
          expiryDate: event.expiryDate,
          daysRemaining: event.daysRemaining,
          urgency: event.urgency,
          isUrgent: event.isUrgent,
        },
      });
    } catch (err) {
      this.logger.error(
        'Failed to dispatch BUNDLE_EXPIRY_WARNING notification',
        {
          userId: event.userId,
          step: 'handle_credit_bundle_expiring_event',
          err: serializeError(err),
        },
      );
    }
  }
}

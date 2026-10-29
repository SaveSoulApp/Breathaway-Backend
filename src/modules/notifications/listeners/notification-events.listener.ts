import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { IdentityType } from '@prisma/client';
import {
  CountryCode,
  getCountryCallingCode,
  parsePhoneNumberWithError,
} from 'libphonenumber-js';

import { DateUtil } from '@common/utils/date.utils';
import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { USER_WELCOME_EVENT, UserWelcomeEvent } from '@modules/auth/events';
import {
  CHAT_MESSAGE_SENT_EVENT,
  ChatMessageSentEvent,
} from '@modules/chats/events';
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
import { PreferencesService } from '@modules/preferences/preferences.service';
import {
  DSAR_EXPORT_COMPLETED_EVENT,
  DsarExportCompletedEvent,
} from '@modules/users/events';

import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';
import { WhatsAppProviderService } from '../providers/whatsapp.provider.service';

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
    private readonly identityCryptoService: IdentityCryptoService,
    private readonly configService: ConfigService,
    private readonly preferencesService: PreferencesService,
    private readonly whatsAppProvider: WhatsAppProviderService,
  ) {
    super(loggerService);
  }

  /**
   * Resolves and decrypts the user's first name from UserProfile for greeting copy.
   */
  private async resolveUserFirstName(userId: string): Promise<string> {
    try {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { firstName: true },
      });
      if (!profile?.firstName) {
        return '';
      }
      const decrypted = await this.identityCryptoService.decryptText(
        profile.firstName,
      );
      return decrypted ?? '';
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
        category: NotificationCategory.SECURITY,
        priority: NotificationPriority.HIGH,
        link: '/settings/devices',
        payload: {
          name,
          platform: event.platform,
          deviceId: event.deviceId ?? '',
          appVersion: event.appVersion ?? '',
          addedAt: DateUtil.now().toUTCString(),
          link: '/settings/devices',
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
    // 1. Dispatch sender confirmation (EMAIL, PUSH)
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.LIKE_SENT,
        category: NotificationCategory.SOCIAL,
        link: '/likes',
        payload: {
          name,
          targetMaskedValue: event.targetMaskedValue,
          targetLabel: event.targetLabel ?? null,
          intent: event.intent,
          expiresAt: event.expiresAt
            ? event.expiresAt.toISOString().slice(0, 10)
            : '',
          link: '/likes',
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch LIKE_SENT notification to sender', {
        userId: event.userId,
        step: 'handle_like_sent_sender_event',
        err: serializeError(err),
      });
    }

    // 2. Dispatch recipient WhatsApp notification (if enabled, phone is +91, cooldown buffer passed)
    try {
      await this.dispatchRecipientWhatsAppLikeNotification(event);
    } catch (err) {
      this.logger.error(
        'Failed to dispatch recipient WhatsApp like notification',
        {
          senderUserId: event.userId,
          targetIdentityId: event.targetIdentityId,
          step: 'handle_like_sent_recipient_whatsapp',
          err: serializeError(err),
        },
      );
    }
  }

  /**
   * Dispatches a WhatsApp notification to the recipient of a like when eligible:
   * 1. Enabled via WHATSAPP_LIKE_NOTIFICATION_ENABLED configuration boolean.
   * 2. Target identity is of type PHONE.
   * 3. Recipient phone number is an Indian number starting with +91.
   * 4. Recipient has not opted out of WhatsApp (if registered).
   * 5. Cooldown buffer ("celebrity problem" rate limit) is not active for the recipient.
   */
  private async dispatchRecipientWhatsAppLikeNotification(
    event: LikeSentEvent,
  ): Promise<void> {
    const isEnabled = this.configService.get<boolean>(
      'WHATSAPP_LIKE_NOTIFICATION_ENABLED',
      false,
    );

    if (!isEnabled) {
      this.logger.debug(
        'WhatsApp like notification is disabled via configuration',
        {
          senderUserId: event.userId,
          targetIdentityId: event.targetIdentityId,
          step: 'whatsapp_like_disabled',
        },
      );
      return;
    }

    if (!event.targetIdentityId) {
      this.logger.debug(
        'Cannot dispatch recipient WhatsApp notification: missing targetIdentityId in event',
        {
          senderUserId: event.userId,
          step: 'missing_target_identity_id',
        },
      );
      return;
    }

    const targetIdentity = await this.prisma.identity.findUnique({
      where: { id: event.targetIdentityId },
      select: {
        id: true,
        type: true,
        userId: true,
        publicValueHash: true,
        publicValueCiphertext: true,
        publicValueIv: true,
        publicValueTag: true,
        publicValueWrappedKey: true,
        publicValueKeyId: true,
        user: {
          select: {
            profile: {
              select: {
                firstName: true,
              },
            },
          },
        },
      },
    });

    if (!targetIdentity) {
      this.logger.warn(
        'Target identity for like notification not found in database',
        {
          targetIdentityId: event.targetIdentityId,
          step: 'target_identity_not_found',
        },
      );
      return;
    }

    if (targetIdentity.type !== IdentityType.PHONE) {
      this.logger.debug(
        'Target identity is not of type PHONE, skipping WhatsApp notification',
        {
          targetIdentityId: targetIdentity.id,
          identityType: targetIdentity.type,
          step: 'skip_non_phone',
        },
      );
      return;
    }

    // Decrypt phone number
    let rawPhone: string | null = null;
    try {
      rawPhone = await this.identityCryptoService.decryptPublicValue({
        publicValueCiphertext: targetIdentity.publicValueCiphertext,
        publicValueIv: targetIdentity.publicValueIv,
        publicValueTag: targetIdentity.publicValueTag,
        publicValueWrappedKey: targetIdentity.publicValueWrappedKey,
        publicValueKeyId: targetIdentity.publicValueKeyId,
      });
    } catch (err) {
      this.logger.error(
        'Failed to decrypt recipient phone number for WhatsApp like notification',
        {
          targetIdentityId: targetIdentity.id,
          step: 'decrypt_phone_failed',
          err: serializeError(err),
        },
      );
      return;
    }

    const allowedCallingCodes = this.getAllowListedCountryCallingCodes();
    const recipientPhone = this.extractAllowListedPhone(
      rawPhone,
      allowedCallingCodes,
    );
    if (!recipientPhone) {
      this.logger.debug(
        'Recipient phone is not in allow-listed country codes, skipping WhatsApp notification',
        {
          targetIdentityId: targetIdentity.id,
          allowedCallingCodes,
          step: 'skip_disallowed_country_code',
        },
      );
      return;
    }

    // Check notification preferences if recipient is a registered user
    if (targetIdentity.userId) {
      const preferences = await this.preferencesService.getPreferences(
        targetIdentity.userId,
      );
      if (!preferences.whatsappEnabled) {
        this.logger.debug(
          'Recipient user has WhatsApp notifications disabled in preferences',
          {
            targetUserId: targetIdentity.userId,
            step: 'skip_preference_disabled',
          },
        );
        return;
      }
    }

    // Resolve recipient name if available
    let recipientFirstName: string | undefined;
    if (targetIdentity.user?.profile?.firstName) {
      try {
        const decryptedName = await this.identityCryptoService.decryptText(
          targetIdentity.user.profile.firstName,
        );
        if (decryptedName && decryptedName.trim().length > 0) {
          recipientFirstName = decryptedName.trim();
        }
      } catch {
        // Fallback to undefined if decryption fails
      }
    }

    const bufferDays =
      this.configService.get<number>(
        'WHATSAPP_LIKE_NOTIFICATION_BUFFER_DAYS',
      ) || 7;
    const bufferTtlSeconds = bufferDays * 24 * 60 * 60;
    const dedupKey = `whatsapp:like_buffer:${targetIdentity.publicValueHash}`;

    await this.whatsAppProvider.sendDirectPhone({
      to: recipientPhone.phoneDigits,
      type: NotificationType.LIKE_RECEIVED,
      params: recipientFirstName ? { name: recipientFirstName } : undefined,
      dedupKey,
      dedupTtlSeconds: bufferTtlSeconds,
    });
  }

  /**
   * Retrieves the allow-listed country calling codes for WhatsApp like notifications.
   * Supports JSON arrays (e.g. '["+91", "+65"]'), comma-separated strings (e.g. '+91, +65' or 'IN, SG'),
   * or direct array input. Converts ISO-2 country codes or +calling codes into digits-only calling codes.
   */
  private getAllowListedCountryCallingCodes(): string[] {
    const raw = this.configService.get<string | string[]>(
      'WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES',
      '["+91"]',
    );

    let rawList: string[] = [];
    if (Array.isArray(raw)) {
      rawList = raw.map(String);
    } else if (typeof raw === 'string' && raw.trim().length > 0) {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            rawList = parsed.map(String);
          }
        } catch {
          rawList = [trimmed];
        }
      } else {
        rawList = trimmed.split(',').map((item) => item.trim());
      }
    }

    if (rawList.length === 0) {
      rawList = ['+91'];
    }

    const callingCodes: string[] = [];
    for (const entry of rawList) {
      const cleaned = entry.trim();
      if (!cleaned) continue;

      // Handle ISO 3166-1 alpha-2 code (e.g. 'IN', 'SG')
      if (/^[A-Za-z]{2}$/.test(cleaned)) {
        try {
          const code = getCountryCallingCode(
            cleaned.toUpperCase() as CountryCode,
          );
          if (code && !callingCodes.includes(code)) {
            callingCodes.push(code);
          }
          continue;
        } catch {
          // not a recognized ISO code, fall through
        }
      }

      // Strip leading '+' and non-digit characters (e.g. '+91' -> '91')
      const digitsOnly = cleaned.replace(/\D/g, '');
      if (digitsOnly && !callingCodes.includes(digitsOnly)) {
        callingCodes.push(digitsOnly);
      }
    }

    return callingCodes.length > 0 ? callingCodes : ['91'];
  }

  /**
   * Validates whether a decrypted phone string matches one of the allow-listed country calling codes
   * and extracts normalized digits.
   */
  private extractAllowListedPhone(
    rawPhone: string | null,
    allowedCallingCodes: string[],
  ): { phoneDigits: string; e164Formatted: string } | null {
    if (!rawPhone || rawPhone.trim() === '') return null;

    const trimmed = rawPhone.trim();
    try {
      const candidate = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
      const parsed = parsePhoneNumberWithError(candidate);
      if (
        parsed.isValid() &&
        allowedCallingCodes.includes(parsed.countryCallingCode)
      ) {
        const phoneDigits = `${parsed.countryCallingCode}${parsed.nationalNumber}`;
        return {
          phoneDigits,
          e164Formatted: `+${phoneDigits}`,
        };
      }
    } catch {
      // libphonenumber parsing failed, fall back to prefix digits inspection
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    for (const code of allowedCallingCodes) {
      if (digitsOnly.startsWith(code) && digitsOnly.length >= code.length + 7) {
        return {
          phoneDigits: digitsOnly,
          e164Formatted: `+${digitsOnly}`,
        };
      }
    }

    return null;
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
        link: '/likes',
        payload: {
          name,
          targetMaskedValue: event.targetMaskedValue,
          targetLabel: event.targetLabel ?? null,
          withdrawnAt: DateUtil.now().toUTCString(),
          link: '/likes',
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

  @OnEvent(MATCH_CREATED_EVENT, { async: true })
  async handleMatchCreated(event: MatchCreatedEvent): Promise<void> {
    try {
      const profiles = await this.prisma.userProfile.findMany({
        where: { userId: { in: [event.userOneId, event.userTwoId] } },
        select: { userId: true, firstName: true },
      });

      const profileOne = profiles.find((p) => p.userId === event.userOneId);
      const profileTwo = profiles.find((p) => p.userId === event.userTwoId);

      const [decryptedOne, decryptedTwo] = await Promise.all([
        profileOne?.firstName
          ? this.identityCryptoService.decryptText(profileOne.firstName)
          : Promise.resolve(null),
        profileTwo?.firstName
          ? this.identityCryptoService.decryptText(profileTwo.firstName)
          : Promise.resolve(null),
      ]);

      const userOneName = decryptedOne ?? 'someone';
      const userTwoName = decryptedTwo ?? 'someone';

      const userOneDisplayName =
        event.likeOneLabel && event.likeOneLabel.trim() !== ''
          ? event.likeOneLabel
          : userTwoName;
      const userTwoDisplayName =
        event.likeTwoLabel && event.likeTwoLabel.trim() !== ''
          ? event.likeTwoLabel
          : userOneName;

      const matchRoute = `/matches/${event.matchId}`;

      // Dispatch for User One
      await this.notificationsService.dispatch({
        channels: [
          NotificationChannel.PUSH,
          NotificationChannel.EMAIL,
          NotificationChannel.WHATSAPP,
        ],
        userIds: [event.userOneId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        link: matchRoute,
        payload: {
          name: userOneName,
          matchName: userOneDisplayName,
          matchId: event.matchId,
          chatUrl: matchRoute,
          link: matchRoute,
        },
      });

      // Dispatch for User Two
      await this.notificationsService.dispatch({
        channels: [
          NotificationChannel.PUSH,
          NotificationChannel.EMAIL,
          NotificationChannel.WHATSAPP,
        ],
        userIds: [event.userTwoId],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        link: matchRoute,
        payload: {
          name: userTwoName,
          matchName: userTwoDisplayName,
          matchId: event.matchId,
          chatUrl: matchRoute,
          link: matchRoute,
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
        category: NotificationCategory.SECURITY,
        priority: NotificationPriority.HIGH,
        link: '/settings/identities',
        payload: {
          name,
          identityType: event.identityType,
          maskedValue: event.maskedValue,
          addedAt: DateUtil.now().toUTCString(),
          isVerified: event.isVerified,
          link: '/settings/identities',
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
        category: NotificationCategory.SECURITY,
        priority: NotificationPriority.HIGH,
        link: '/settings/identities',
        payload: {
          name,
          identityType: event.identityType,
          maskedValue: event.maskedValue,
          removedAt: DateUtil.now().toUTCString(),
          link: '/settings/identities',
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
        channels: [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP],
        userIds: [event.userId],
        type: NotificationType.WELCOME,
        category: NotificationCategory.SYSTEM,
        link: '/explore',
        payload: {
          name,
          link: '/explore',
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
        category: NotificationCategory.BILLING,
        link: '/credits',
        payload: {
          name,
          creditsAdded: Math.abs(event.amount),
          creditBalance: event.balance,
          transactionId: event.referenceId ?? '',
          expiresAt: event.expiresAt
            ? event.expiresAt.toISOString().slice(0, 10)
            : '',
          link: '/credits',
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
        category: NotificationCategory.BILLING,
        link: '/credits',
        payload: {
          name,
          creditsUsed: event.amount,
          creditBalance: event.balance,
          usedAt: DateUtil.now().toUTCString(),
          link: '/credits',
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
        category: NotificationCategory.REMINDER,
        link: '/likes',
        payload: {
          name,
          count: event.count,
          expiryDate: event.expiryDate,
          link: '/likes',
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
        category: NotificationCategory.REMINDER,
        link: '/credits',
        payload: {
          name,
          count: event.count,
          expiryDate: event.expiryDate,
          daysRemaining: event.daysRemaining,
          urgency: event.urgency,
          isUrgent: event.isUrgent,
          link: '/credits',
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

  @OnEvent(CHAT_MESSAGE_SENT_EVENT, { async: true })
  async handleChatMessageSent(event: ChatMessageSentEvent): Promise<void> {
    try {
      const [recipientName, senderName] = await Promise.all([
        this.resolveUserFirstName(event.recipientId),
        this.resolveUserFirstName(event.senderId),
      ]);

      const messagePreview =
        event.content.length > 80
          ? `${event.content.slice(0, 77)}...`
          : event.content;

      const link = `/matches/${event.matchId}`;

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.PUSH],
        userIds: [event.recipientId],
        type: NotificationType.NEW_MESSAGE,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.HIGH,
        link,
        payload: {
          name: recipientName,
          senderName: senderName || 'Someone',
          messagePreview,
          roomId: event.roomId,
          matchId: event.matchId,
          chatUrl: link,
          link,
        },
      });
    } catch (err) {
      this.logger.error('Failed to dispatch NEW_MESSAGE notification', {
        roomId: event.roomId,
        senderId: event.senderId,
        recipientId: event.recipientId,
        step: 'handle_chat_message_sent_event',
        err: serializeError(err),
      });
    }
  }

  @OnEvent(DSAR_EXPORT_COMPLETED_EVENT, { async: true })
  async handleDsarExportCompleted(
    event: DsarExportCompletedEvent,
  ): Promise<void> {
    try {
      const name = await this.resolveUserFirstName(event.userId);

      await this.notificationsService.dispatch({
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        userIds: [event.userId],
        type: NotificationType.DSAR_EXPORT_READY,
        category: NotificationCategory.SECURITY,
        priority: NotificationPriority.HIGH,
        link: '/settings/privacy',
        payload: {
          name,
          expiresAt: event.expiresAt.toUTCString(),
          link: '/settings/privacy',
        },
      });

      this.logger.info('Dispatched DSAR export ready notification', {
        userId: event.userId,
        exportId: event.exportId,
        step: 'handle_dsar_export_completed',
      });
    } catch (err: unknown) {
      this.logger.error('Failed to dispatch DSAR export ready notification', {
        userId: event.userId,
        exportId: event.exportId,
        step: 'handle_dsar_export_completed',
        err: serializeError(err),
      });
    }
  }
}

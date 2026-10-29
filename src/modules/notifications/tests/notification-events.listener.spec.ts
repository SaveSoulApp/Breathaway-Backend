import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform, IdentityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { UserWelcomeEvent } from '@modules/auth/events';
import { ChatMessageSentEvent } from '@modules/chats/events';
import {
  CreditBundleExpiringEvent,
  CreditsPurchasedEvent,
  CreditsUsedEvent,
} from '@modules/credits/events';
import { DeviceAddedEvent } from '@modules/devices/events';
import {
  IdentityAddedEvent,
  IdentityRemovedEvent,
} from '@modules/identities/events';
import { LikeSentEvent, LikeWithdrawnEvent } from '@modules/likes/events';
import { LikesExpiredEvent } from '@modules/maintenance/events';
import { MatchCreatedEvent } from '@modules/match-resolver/events';
import { PreferencesService } from '@modules/preferences/preferences.service';
import { DsarExportCompletedEvent } from '@modules/users/events';

import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationEventsListener } from '../listeners/notification-events.listener';
import { NotificationsService } from '../notifications.service';
import { WhatsAppProviderService } from '../providers/whatsapp.provider.service';

describe('NotificationEventsListener', () => {
  let listener: NotificationEventsListener;
  let prisma: MockPrismaService;
  let notificationsService: jest.Mocked<NotificationsService>;
  let configService: { get: jest.Mock };
  let preferencesService: { getPreferences: jest.Mock };
  let whatsAppProvider: { sendDirectPhone: jest.Mock };
  let identityCryptoService: {
    decryptText: jest.Mock;
    decryptPublicValue: jest.Mock;
  };
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    event: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
      verbose: jest.fn(),
    };

    const mockLogger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockNotificationsService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          WHATSAPP_LIKE_NOTIFICATION_ENABLED: true,
          WHATSAPP_LIKE_NOTIFICATION_BUFFER_DAYS: 7,
          WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES: '["+91"]',
        };
        return values[key] ?? defaultValue;
      }),
    };

    preferencesService = {
      getPreferences: jest.fn().mockResolvedValue({
        pushEnabled: true,
        whatsappEnabled: true,
        smsEnabled: true,
        emailEnabled: true,
      }),
    };

    whatsAppProvider = {
      sendDirectPhone: jest.fn().mockResolvedValue(true),
    };

    identityCryptoService = {
      decryptText: jest.fn().mockImplementation((val?: string | null) => {
        if (!val) return Promise.resolve(null);
        if (val.startsWith('enc:v1:')) {
          const parts = val.split(':');
          return Promise.resolve(parts[parts.length - 1]);
        }
        return Promise.resolve(val);
      }),
      decryptPublicValue: jest.fn().mockResolvedValue('+919876543210'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsListener,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: IdentityCryptoService,
          useValue: identityCryptoService,
        },
        { provide: ConfigService, useValue: configService },
        { provide: PreferencesService, useValue: preferencesService },
        { provide: WhatsAppProviderService, useValue: whatsAppProvider },
      ],
    }).compile();

    listener = module.get<NotificationEventsListener>(
      NotificationEventsListener,
    );
    prisma = module.get(PrismaService);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleDeviceAdded', () => {
    it('should dispatch DEVICE_ADDED notification with resolved user firstName', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Alice',
      } as never);

      const event = new DeviceAddedEvent(
        'user-1',
        DevicePlatform.IOS,
        'dev-123',
        '1.0.0',
      );

      await listener.handleDeviceAdded(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.DEVICE_ADDED,
          category: NotificationCategory.SECURITY,
          priority: NotificationPriority.HIGH,
          channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Alice',
            platform: DevicePlatform.IOS,
            deviceId: 'dev-123',
            appVersion: '1.0.0',
          }),
        }),
      );
    });

    it('should catch and log error if dispatch fails', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Alice',
      } as never);
      notificationsService.dispatch.mockRejectedValue(
        new Error('Dispatch error'),
      );

      const event = new DeviceAddedEvent('user-1', DevicePlatform.IOS);

      await expect(listener.handleDeviceAdded(event)).resolves.not.toThrow();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to dispatch DEVICE_ADDED notification',
        expect.anything(),
      );
    });
  });

  describe('handleLikeSent', () => {
    it('should dispatch LIKE_SENT notification to sender with resolved firstName', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Bob',
      } as never);

      const event = new LikeSentEvent(
        'user-1',
        '+1***99',
        'Gym Buddy',
        'ROMANTIC',
        new Date('2026-10-01'),
      );

      await listener.handleLikeSent(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LIKE_SENT,
          category: NotificationCategory.SOCIAL,
          channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Bob',
            targetMaskedValue: '+1***99',
            targetLabel: 'Gym Buddy',
            intent: 'ROMANTIC',
          }),
        }),
      );
    });

    it('should not dispatch WhatsApp notification to recipient when WHATSAPP_LIKE_NOTIFICATION_ENABLED is false', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'WHATSAPP_LIKE_NOTIFICATION_ENABLED') return false;
          return defaultValue;
        },
      );

      const event = new LikeSentEvent(
        'user-1',
        '+91***10',
        null,
        'ROMANTIC',
        null,
        'identity-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'WhatsApp like notification is disabled via configuration',
        expect.anything(),
      );
    });

    it('should not dispatch WhatsApp notification when target identity is not of type PHONE', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-1',
        type: IdentityType.EMAIL,
        userId: null,
        publicValueHash: 'hash-1',
      } as never);

      const event = new LikeSentEvent(
        'user-1',
        't***@gmail.com',
        null,
        'ROMANTIC',
        null,
        'identity-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Target identity is not of type PHONE, skipping WhatsApp notification',
        expect.anything(),
      );
    });

    it('should not dispatch WhatsApp notification when recipient phone country code is not in allowlist', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-1',
        type: IdentityType.PHONE,
        userId: null,
        publicValueHash: 'hash-1',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+14155552671', // US number
      );

      const event = new LikeSentEvent(
        'user-1',
        '+1***71',
        null,
        'ROMANTIC',
        null,
        'identity-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Recipient phone is not in allow-listed country codes, skipping WhatsApp notification',
        expect.anything(),
      );
    });

    it('should dispatch WhatsApp notification to Singapore (+65) recipient when Singapore is allow-listed', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES') {
            return '["+91", "+65"]';
          }
          if (key === 'WHATSAPP_LIKE_NOTIFICATION_ENABLED') return true;
          return defaultValue;
        },
      );

      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-sg-1',
        type: IdentityType.PHONE,
        userId: null,
        publicValueHash: 'hash-sg-recipient',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
        user: null,
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+6581234567',
      );

      const event = new LikeSentEvent(
        'sender-user-1',
        '+65***67',
        null,
        'ROMANTIC',
        null,
        'identity-sg-1',
        'like-sg-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledTimes(1);
      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '6581234567',
          dedupKey: 'whatsapp:like_buffer:hash-sg-recipient',
        }),
      );
    });

    it('should support ISO-2 country codes in allowlist (e.g. "SG, IN")', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'WHATSAPP_LIKE_ALLOWED_COUNTRY_CODES') {
            return 'SG, IN';
          }
          if (key === 'WHATSAPP_LIKE_NOTIFICATION_ENABLED') return true;
          return defaultValue;
        },
      );

      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-sg-2',
        type: IdentityType.PHONE,
        userId: null,
        publicValueHash: 'hash-sg-2',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
        user: null,
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+6581234567',
      );

      const event = new LikeSentEvent(
        'sender-user-1',
        '+65***67',
        null,
        'ROMANTIC',
        null,
        'identity-sg-2',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '6581234567',
        }),
      );
    });

    it('should dispatch WhatsApp notification to recipient (+91) when unregistered (without name placeholder)', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-1',
        type: IdentityType.PHONE,
        userId: null, // Unregistered user
        publicValueHash: 'hash-indian-recipient',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
        user: null,
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+919876543210',
      );

      const event = new LikeSentEvent(
        'sender-user-1',
        '+91***10',
        null,
        'ROMANTIC',
        null,
        'identity-1',
        'like-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledTimes(1);
      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledWith({
        to: '919876543210',
        type: NotificationType.LIKE_RECEIVED,
        params: undefined,
        dedupKey: 'whatsapp:like_buffer:hash-indian-recipient',
        dedupTtlSeconds: 7 * 86400,
      });
    });

    it('should dispatch WhatsApp notification to recipient (+91) with firstName when registered', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-1',
        type: IdentityType.PHONE,
        userId: 'recipient-user-2',
        publicValueHash: 'hash-indian-registered',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
        user: {
          profile: {
            firstName: 'enc:v1:Anamika',
          },
        },
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+919876543210',
      );

      const event = new LikeSentEvent(
        'sender-user-1',
        '+91***10',
        null,
        'ROMANTIC',
        null,
        'identity-1',
        'like-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledTimes(1);
      expect(whatsAppProvider.sendDirectPhone).toHaveBeenCalledWith({
        to: '919876543210',
        type: NotificationType.LIKE_RECEIVED,
        params: { name: 'Anamika' },
        dedupKey: 'whatsapp:like_buffer:hash-indian-registered',
        dedupTtlSeconds: 7 * 86400,
      });
    });

    it('should not dispatch WhatsApp notification when registered recipient disabled whatsapp in preferences', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        id: 'identity-1',
        type: IdentityType.PHONE,
        userId: 'recipient-user-2',
        publicValueHash: 'hash-indian-optout',
        publicValueCiphertext: 'cipher',
        publicValueIv: 'iv',
        publicValueTag: 'tag',
        publicValueWrappedKey: 'key',
        publicValueKeyId: 'k1',
        user: { profile: { firstName: 'Anamika' } },
      } as never);

      identityCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+919876543210',
      );

      preferencesService.getPreferences.mockResolvedValueOnce({
        whatsappEnabled: false,
      });

      const event = new LikeSentEvent(
        'sender-user-1',
        '+91***10',
        null,
        'ROMANTIC',
        null,
        'identity-1',
      );

      await listener.handleLikeSent(event);

      expect(whatsAppProvider.sendDirectPhone).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Recipient user has WhatsApp notifications disabled in preferences',
        expect.anything(),
      );
    });
  });

  describe('handleLikeWithdrawn', () => {
    it('should dispatch LIKE_WITHDRAWN notification with resolved sender firstName', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Bob',
      } as never);

      const event = new LikeWithdrawnEvent('user-1', '+1***99', 'Gym Buddy');

      await listener.handleLikeWithdrawn(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LIKE_WITHDRAWN,
          category: NotificationCategory.SOCIAL,
          channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Bob',
            targetMaskedValue: '+1***99',
            targetLabel: 'Gym Buddy',
          }),
        }),
      );
    });
  });

  describe('handleMatchCreated', () => {
    it('should dispatch NEW_MATCH notifications to both users with customized display names', async () => {
      prisma.userProfile.findMany.mockResolvedValue([
        { userId: 'user-1', firstName: 'Alice' },
        { userId: 'user-2', firstName: 'Bob' },
      ] as never);

      const event = new MatchCreatedEvent(
        'match-100',
        'user-1',
        'user-2',
        'Bob from Coffee Shop',
        null,
      );

      await listener.handleMatchCreated(event);

      // Dispatch for User One
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_MATCH,
          channels: [
            NotificationChannel.PUSH,
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
          ],
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Alice',
            matchName: 'Bob from Coffee Shop',
            matchId: 'match-100',
          }),
        }),
      );

      // Dispatch for User Two
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_MATCH,
          channels: [
            NotificationChannel.PUSH,
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
          ],
          userIds: ['user-2'],
          payload: expect.objectContaining({
            name: 'Bob',
            matchName: 'Alice',
            matchId: 'match-100',
          }),
        }),
      );
    });
  });

  describe('handleIdentityAdded', () => {
    it('should dispatch IDENTITY_ADDED notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Charlie',
      } as never);

      const event = new IdentityAddedEvent(
        'user-1',
        'Email',
        'c***@example.com',
        true,
      );

      await listener.handleIdentityAdded(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.IDENTITY_ADDED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Charlie',
            identityType: 'Email',
            maskedValue: 'c***@example.com',
            isVerified: true,
          }),
        }),
      );
    });
  });

  describe('handleIdentityRemoved', () => {
    it('should dispatch IDENTITY_REMOVED notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Charlie',
      } as never);

      const event = new IdentityRemovedEvent(
        'user-1',
        'Email',
        'c***@example.com',
      );

      await listener.handleIdentityRemoved(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.IDENTITY_REMOVED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Charlie',
            identityType: 'Email',
            maskedValue: 'c***@example.com',
          }),
        }),
      );
    });
  });

  describe('handleUserWelcome', () => {
    it('should dispatch WELCOME notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Diana',
      } as never);

      const event = new UserWelcomeEvent('user-1');

      await listener.handleUserWelcome(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.WELCOME,
          channels: [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP],
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Diana',
          }),
        }),
      );
    });
  });

  describe('handleCreditsPurchased', () => {
    it('should dispatch CREDITS_PURCHASED notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Eve',
      } as never);

      const event = new CreditsPurchasedEvent(
        'user-1',
        50,
        150,
        'order-999',
        new Date('2026-12-31'),
      );

      await listener.handleCreditsPurchased(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.CREDITS_PURCHASED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Eve',
            creditsAdded: 50,
            creditBalance: 150,
            transactionId: 'order-999',
          }),
        }),
      );
    });
  });

  describe('handleCreditsUsed', () => {
    it('should dispatch CREDITS_USED notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Eve',
      } as never);

      const event = new CreditsUsedEvent('user-1', 10, 140);

      await listener.handleCreditsUsed(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.CREDITS_USED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Eve',
            creditsUsed: 10,
            creditBalance: 140,
          }),
        }),
      );
    });
  });

  describe('handleLikesExpired', () => {
    it('should dispatch LIKES_EXPIRED notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Frank',
      } as never);

      const event = new LikesExpiredEvent('user-1', 5, '2026-06-01');

      await listener.handleLikesExpired(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LIKES_EXPIRED,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Frank',
            count: 5,
            expiryDate: '2026-06-01',
          }),
        }),
      );
    });
  });

  describe('handleCreditBundleExpiring', () => {
    it('should dispatch BUNDLE_EXPIRY_WARNING notification', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Grace',
      } as never);

      const event = new CreditBundleExpiringEvent(
        'user-1',
        25,
        '2026-07-01',
        2,
        'warning',
        true,
      );

      await listener.handleCreditBundleExpiring(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.BUNDLE_EXPIRY_WARNING,
          userIds: ['user-1'],
          payload: expect.objectContaining({
            name: 'Grace',
            count: 25,
            expiryDate: '2026-07-01',
            daysRemaining: 2,
            urgency: 'warning',
            isUrgent: true,
          }),
        }),
      );
    });
  });

  describe('handleChatMessageSent', () => {
    it('should dispatch NEW_MESSAGE notification with preview and match route link', async () => {
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ firstName: 'Bob' } as never)
        .mockResolvedValueOnce({ firstName: 'Alice' } as never);

      const event = new ChatMessageSentEvent(
        'msg-1',
        'room-1',
        'match-1',
        'sender-user',
        'recipient-user',
        'Hey there! How are you doing today?',
      );

      await listener.handleChatMessageSent(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_MESSAGE,
          category: NotificationCategory.SOCIAL,
          priority: NotificationPriority.HIGH,
          channels: [NotificationChannel.PUSH],
          userIds: ['recipient-user'],
          link: '/matches/match-1',
          payload: expect.objectContaining({
            name: 'Bob',
            senderName: 'Alice',
            messagePreview: 'Hey there! How are you doing today?',
            roomId: 'room-1',
            matchId: 'match-1',
            chatUrl: '/matches/match-1',
            link: '/matches/match-1',
          }),
        }),
      );
    });

    it('should truncate preview if message content is long', async () => {
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ firstName: 'Bob' } as never)
        .mockResolvedValueOnce({ firstName: 'Alice' } as never);

      const longContent = 'A'.repeat(100);
      const event = new ChatMessageSentEvent(
        'msg-2',
        'room-1',
        'match-1',
        'sender-user',
        'recipient-user',
        longContent,
      );

      await listener.handleChatMessageSent(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_MESSAGE,
          payload: expect.objectContaining({
            messagePreview: `${'A'.repeat(77)}...`,
          }),
        }),
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Bob',
      } as never);
      notificationsService.dispatch.mockRejectedValue(
        new Error('Dispatch error'),
      );

      const event = new ChatMessageSentEvent(
        'msg-3',
        'room-1',
        'match-1',
        'sender-user',
        'recipient-user',
        'Hello',
      );

      await expect(
        listener.handleChatMessageSent(event),
      ).resolves.not.toThrow();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to dispatch NEW_MESSAGE notification',
        expect.anything(),
      );
    });
  });

  describe('handleDsarExportCompleted', () => {
    it('should dispatch DSAR_EXPORT_READY notification with resolved user firstName', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Alice',
      } as never);

      const expiresAt = new Date('2026-10-25T12:00:00Z');
      const event = new DsarExportCompletedEvent(
        'user-1',
        'export-123',
        expiresAt,
      );

      await listener.handleDsarExportCompleted(event);

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
          userIds: ['user-1'],
          type: NotificationType.DSAR_EXPORT_READY,
          category: NotificationCategory.SECURITY,
          priority: NotificationPriority.HIGH,
          link: '/settings/privacy',
          payload: expect.objectContaining({
            name: 'Alice',
            expiresAt: expiresAt.toUTCString(),
            link: '/settings/privacy',
          }),
        }),
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        firstName: 'Alice',
      } as never);
      notificationsService.dispatch.mockRejectedValue(
        new Error('Dispatch error'),
      );

      const event = new DsarExportCompletedEvent(
        'user-1',
        'export-123',
        new Date('2026-10-25T12:00:00Z'),
      );

      await expect(
        listener.handleDsarExportCompleted(event),
      ).resolves.not.toThrow();
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to dispatch DSAR export ready notification',
        expect.anything(),
      );
    });
  });
});

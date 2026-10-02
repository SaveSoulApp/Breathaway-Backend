import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { DateUtil } from '@common/utils/date.utils';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PreferencesService } from '@modules/preferences/preferences.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { EmailService } from '../email/email.service';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';
import { FcmProviderService } from '../providers/fcm.provider.service';
import { WhatsAppProviderService } from '../providers/whatsapp.provider.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let pubSubPublisherService: jest.Mocked<PubSubPublisherService>;
  let prismaService: jest.Mocked<PrismaService>;
  let fcmProvider: jest.Mocked<FcmProviderService>;
  let emailService: jest.Mocked<EmailService>;
  let whatsAppProvider: jest.Mocked<WhatsAppProviderService>;
  let preferencesService: jest.Mocked<PreferencesService>;

  beforeEach(async () => {
    const contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
      verbose: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockPubSub = {
      publish: jest.fn(),
    };

    const mockPrisma = {
      device: {
        findMany: jest.fn(),
      },
      userProfile: {
        findUnique: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        createMany: jest.fn(),
        createManyAndReturn: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const mockFcm = { send: jest.fn() };
    const mockEmail = { send: jest.fn() };
    const mockWhatsApp = { send: jest.fn() };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('mock-topic'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        NotificationsService,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PubSubPublisherService, useValue: mockPubSub },
        { provide: FcmProviderService, useValue: mockFcm },
        { provide: EmailService, useValue: mockEmail },
        { provide: WhatsAppProviderService, useValue: mockWhatsApp },
        {
          provide: PreferencesService,
          useValue: { getPreferencesMany: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    pubSubPublisherService = module.get(PubSubPublisherService);
    prismaService = module.get(PrismaService);
    fcmProvider = module.get(FcmProviderService);
    emailService = module.get(EmailService);
    whatsAppProvider = module.get(WhatsAppProviderService);
    preferencesService = module.get(PreferencesService);

    preferencesService.getPreferencesMany.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('dispatch', () => {
    it('should publish a message to pubsub', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      pubSubPublisherService.publish.mockResolvedValue('msg-id');

      await service.dispatch(dto);

      expect(pubSubPublisherService.publish).toHaveBeenCalledWith(
        'mock-topic',
        PubSubEvent.NOTIFICATION_SEND_REQUESTED,
        dto,
      );
    });
  });

  describe('processSendRequest', () => {
    it('should persist to database and call fcmProvider if PUSH is requested', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      const mockDevices = [
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token1',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
      ];

      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif-123',
        userId: 'user-1',
      });

      (prismaService.device.findMany as jest.Mock).mockResolvedValue(
        mockDevices,
      );
      fcmProvider.send.mockResolvedValue();

      const prefMap = new Map();
      prefMap.set('user-1', { pushEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.SYSTEM_ALERT,
          category: NotificationCategory.SYSTEM,
          title: 'Title',
          body: 'Body',
          isRead: false,
        }),
      });
      expect(prismaService.device.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-1'] },
          isActive: true,
        },
      });
      expect(fcmProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'notif-123' }),
        mockDevices,
        expect.any(Map),
      );
      expect(emailService.send).not.toHaveBeenCalled();
      expect(whatsAppProvider.send).not.toHaveBeenCalled();
    });

    it('should NOT persist to database or send push if both title and body are empty', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        type: 'CUSTOM_EMPTY' as NotificationType,
        category: NotificationCategory.SYSTEM,
      };

      const prefMap = new Map();
      prefMap.set('user-1', { pushEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(
        prismaService.notification.createManyAndReturn,
      ).not.toHaveBeenCalled();
      expect(fcmProvider.send).not.toHaveBeenCalled();
    });

    it('should NOT persist to database if only EMAIL or WHATSAPP is requested', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.EMAIL],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      emailService.send.mockResolvedValue(undefined as never);

      const prefMap = new Map();
      prefMap.set('user-1', { emailEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(
        prismaService.notification.createManyAndReturn,
      ).not.toHaveBeenCalled();
      expect(emailService.send).toHaveBeenCalled();
      expect(fcmProvider.send).not.toHaveBeenCalled();
    });

    it('should persist in bulk for multiple recipients when PUSH is requested', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1', 'user-2'],
        channels: [NotificationChannel.PUSH],
        title: 'Broadcast Title',
        body: 'Broadcast Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      (
        prismaService.notification.createManyAndReturn as jest.Mock
      ).mockResolvedValue([
        { id: 'notif-1', userId: 'user-1' },
        { id: 'notif-2', userId: 'user-2' },
      ]);
      (prismaService.device.findMany as jest.Mock).mockResolvedValue([]);
      fcmProvider.send.mockResolvedValue();

      const prefMap = new Map();
      prefMap.set('user-1', { pushEnabled: true });
      prefMap.set('user-2', { pushEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(
        prismaService.notification.createManyAndReturn,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1' }),
          expect.objectContaining({ userId: 'user-2' }),
        ]),
        select: { id: true, userId: true },
      });
      expect(fcmProvider.send).toHaveBeenCalledWith(
        dto,
        [],
        new Map([
          ['user-1', 'notif-1'],
          ['user-2', 'notif-2'],
        ]),
      );
    });

    it('should route to multiple providers if multiple channels are requested', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [
          NotificationChannel.PUSH,
          NotificationChannel.EMAIL,
          NotificationChannel.WHATSAPP,
        ],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      (prismaService.notification.create as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
      });
      (prismaService.device.findMany as jest.Mock).mockResolvedValue([]);
      fcmProvider.send.mockResolvedValue();
      emailService.send.mockResolvedValue(undefined as never);
      whatsAppProvider.send.mockResolvedValue();

      const prefMap = new Map();
      prefMap.set('user-1', {
        pushEnabled: true,
        emailEnabled: true,
        whatsappEnabled: true,
      });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(prismaService.notification.create).toHaveBeenCalled();
      expect(fcmProvider.send).toHaveBeenCalled();
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          emailType: expect.anything(),
          userIds: expect.anything(),
          templateData: expect.anything(),
        }),
      );
      expect(whatsAppProvider.send).toHaveBeenCalledWith(dto);
    });

    it('should handle provider rejections gracefully without throwing', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.EMAIL],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      emailService.send.mockRejectedValue(new Error('Email failed'));

      const prefMap = new Map();
      prefMap.set('user-1', { emailEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await expect(service.processSendRequest(dto)).resolves.not.toThrow();
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated notifications feed and unread count', async () => {
      const mockRows = [
        {
          id: 'notif-2',
          userId: 'user-1',
          type: NotificationType.NEW_MATCH,
          category: NotificationCategory.SOCIAL,
          priority: NotificationPriority.NORMAL,
          title: 'New Match!',
          body: 'You matched with Sarah',
          action: 'NAVIGATE',
          link: '/matches/mat_1',
          data: { matchId: 'mat_1' },
          isRead: false,
          readAt: null,
          createdAt: new Date('2026-09-30T10:00:00Z'),
        },
      ];

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockRows,
      );
      (prismaService.notification.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getUserNotifications('user-1', {
        limit: 10,
      });

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isDismissed: false,
        },
        take: 11,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.unreadCount).toBe(1);
    });

    it('should calculate nextCursor and hasMore when results exceed limit', async () => {
      const mockRows = [
        {
          id: 'notif-2',
          userId: 'user-1',
          type: NotificationType.NEW_MATCH,
          category: NotificationCategory.SOCIAL,
          priority: NotificationPriority.NORMAL,
          title: 'Title 2',
          body: 'Body 2',
          action: null,
          link: null,
          data: null,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        },
        {
          id: 'notif-1',
          userId: 'user-1',
          type: NotificationType.LIKE_SENT,
          category: NotificationCategory.SOCIAL,
          priority: NotificationPriority.NORMAL,
          title: 'Title 1',
          body: 'Body 1',
          action: null,
          link: null,
          data: null,
          isRead: true,
          readAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (prismaService.notification.findMany as jest.Mock).mockResolvedValue(
        mockRows,
      );
      (prismaService.notification.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getUserNotifications('user-1', {
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('notif-2');
    });

    it('should pass cursor and skip with compound orderBy and skip unreadCount when cursor is provided', async () => {
      (prismaService.notification.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getUserNotifications('user-1', {
        cursor: 'notif-1',
        limit: 10,
      });

      expect(prismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isDismissed: false,
        },
        take: 11,
        cursor: { id: 'notif-1' },
        skip: 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(prismaService.notification.count).not.toHaveBeenCalled();
      expect(result.unreadCount).toBeUndefined();
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      (prismaService.notification.count as jest.Mock).mockResolvedValue(4);

      const result = await service.getUnreadCount('user-1');

      expect(prismaService.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isRead: false,
          isDismissed: false,
        },
      });
      expect(result).toEqual({ unreadCount: 4 });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read and return updated entity', async () => {
      (prismaService.notification.findFirst as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.NORMAL,
        title: 'New Match!',
        body: 'Matched',
        action: null,
        link: null,
        data: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const updatedDate = new Date();
      (prismaService.notification.update as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.NORMAL,
        title: 'New Match!',
        body: 'Matched',
        action: null,
        link: null,
        data: null,
        isRead: true,
        readAt: updatedDate,
        createdAt: new Date(),
      });

      const result = await service.markAsRead('user-1', 'notif-1');

      expect(prismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      (prismaService.notification.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.markAsRead('user-1', 'nonexistent-id'),
      ).rejects.toThrow('Notification with ID "nonexistent-id" was not found');
    });
  });

  describe('markAllAsRead', () => {
    it('should bulk mark all unread notifications as read', async () => {
      (prismaService.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await service.markAllAsRead('user-1');

      expect(prismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isRead: false,
          isDismissed: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ updatedCount: 5 });
    });
  });

  describe('dismissNotification', () => {
    it('should set isDismissed to true in a single updateMany operation', async () => {
      (prismaService.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await service.dismissNotification('user-1', 'notif-1');

      expect(prismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'user-1',
          isDismissed: false,
        },
        data: { isDismissed: true },
      });
    });

    it('should throw NotFoundException if notification does not exist or is already dismissed', async () => {
      (prismaService.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        service.dismissNotification('user-1', 'nonexistent-id'),
      ).rejects.toThrow('Notification with ID "nonexistent-id" was not found');
    });
  });
});

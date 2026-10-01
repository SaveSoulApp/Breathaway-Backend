import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { JwtAuthGuard } from '@common/guards';
import { LoggerService } from '@core/logger';
import { AdminBasicAuthGuard } from '@modules/admin/guards/admin-basic-auth.guard';

import {
  BatchReadResponseDto,
  GetNotificationsRequestDto,
  NotificationResponseDto,
  PaginatedNotificationsResponseDto,
  SendNotificationRequestDto,
  SendNotificationResponseDto,
  UnreadCountResponseDto,
} from '../dto';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from '../notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    const contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockService = {
      dispatch: jest.fn(),
      getUserNotifications: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      dismissNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    })
      .overrideGuard(AdminBasicAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should return paginated notifications feed for the current user', async () => {
      const query: GetNotificationsRequestDto = { limit: 10 };
      const expectedResponse: PaginatedNotificationsResponseDto = {
        items: [],
        nextCursor: null,
        hasMore: false,
        unreadCount: 0,
      };

      service.getUserNotifications.mockResolvedValue(expectedResponse);

      const result = await controller.getNotifications('user-1', query);

      expect(service.getUserNotifications).toHaveBeenCalledWith(
        'user-1',
        query,
      );
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      const expectedResponse: UnreadCountResponseDto = { unreadCount: 3 };
      service.getUnreadCount.mockResolvedValue(expectedResponse);

      const result = await controller.getUnreadCount('user-1');

      expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read and return updated entity', async () => {
      const expectedResponse: NotificationResponseDto = {
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        priority: NotificationPriority.NORMAL,
        title: 'New Match',
        body: 'You have a match',
        isRead: true,
        createdAt: new Date(),
      };

      service.markAsRead.mockResolvedValue(expectedResponse);

      const result = await controller.markAsRead('user-1', 'notif-1');

      expect(service.markAsRead).toHaveBeenCalledWith('user-1', 'notif-1');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const expectedResponse: BatchReadResponseDto = { updatedCount: 4 };
      service.markAllAsRead.mockResolvedValue(expectedResponse);

      const result = await controller.markAllAsRead('user-1');

      expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('dismissNotification', () => {
    it('should dismiss notification for user', async () => {
      service.dismissNotification.mockResolvedValue();

      await controller.dismissNotification('user-1', 'notif-1');

      expect(service.dismissNotification).toHaveBeenCalledWith(
        'user-1',
        'notif-1',
      );
    });
  });

  describe('send', () => {
    it('should successfully dispatch a notification request and return SendNotificationResponseDto', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        title: 'Test Notification',
        body: 'This is a test notification.',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      service.dispatch.mockResolvedValue();

      const result: SendNotificationResponseDto = await controller.send(dto);

      expect(service.dispatch).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        success: true,
        message: 'Notification dispatch requested for 1 users',
        userCount: 1,
      });
    });

    it('should propagate error when dispatch fails without duplicate local error handling', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        title: 'Test Notification',
        body: 'This is a test notification.',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      const dispatchError = new Error('Pub/Sub queue unavailable');
      service.dispatch.mockRejectedValue(dispatchError);

      await expect(controller.send(dto)).rejects.toThrow(dispatchError);
      expect(service.dispatch).toHaveBeenCalledWith(dto);
    });
  });
});

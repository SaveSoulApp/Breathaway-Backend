import { EventEmitter2 } from '@nestjs/event-emitter';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { FirebaseService } from '@modules/firebase/firebase.service';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { SendNotificationRequestDto } from '../../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationType } from '../../enums/notification-type.enum';
import { FcmProviderService } from '../../providers/fcm.provider.service';
import { NotificationPriority } from '../../enums/notification-priority.enum';

describe('FcmProviderService', () => {
  let service: FcmProviderService;

  const mockMessaging = {
    send: jest.fn(),
    sendEachForMulticast: jest.fn(),
  };

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

    const mockFirebaseService = {
      getMessaging: jest.fn().mockReturnValue(mockMessaging),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        FcmProviderService,
        { provide: LoggerService, useValue: logger },
        { provide: FirebaseService, useValue: mockFirebaseService },
      ],
    }).compile();

    service = module.get<FcmProviderService>(FcmProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    const baseDto: SendNotificationRequestDto = {
      userIds: ['user-1'],
      title: 'Test Title',
      body: 'Test Body',
      type: NotificationType.SYSTEM_ALERT,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.HIGH,
      id: 'test-id',
    };

    it('should return early if no devices are provided', async () => {
      await service.send(baseDto, []);
      expect(mockMessaging.send).not.toHaveBeenCalled();
      expect(mockMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('should use send for a single device token', async () => {
      const devices = [
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token-ios',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
      ];

      mockMessaging.send.mockResolvedValue('msg-id');

      await service.send(baseDto, devices);

      expect(mockMessaging.send).toHaveBeenCalledTimes(1);
      const callArgs = mockMessaging.send.mock.calls[0][0];
      expect(callArgs.token).toBe('token-ios');
      expect(callArgs.notification.title).toBe('Test Title');
      expect(callArgs.apns).toBeDefined();
    });

    it('should use sendEachForMulticast for multiple devices of the same platform', async () => {
      const devices = [
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token-ios-1',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
        {
          id: 'dev-2',
          userId: 'user-1',
          token: 'token-ios-2',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
      ];

      mockMessaging.sendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      await service.send(baseDto, devices);

      expect(mockMessaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
      const callArgs = mockMessaging.sendEachForMulticast.mock.calls[0][0];
      expect(callArgs.tokens).toEqual(['token-ios-1', 'token-ios-2']);
      expect(callArgs.apns).toBeDefined();
      expect(callArgs.android).toBeUndefined();
    });

    it('should batch process iOS and Android devices separately', async () => {
      const devices = [
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token-ios',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
        {
          id: 'dev-2',
          userId: 'user-1',
          token: 'token-android',
          platform: DevicePlatform.ANDROID,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
      ];

      mockMessaging.send.mockResolvedValue('msg-id');

      await service.send(baseDto, devices);

      // It should call send twice (once for iOS, once for Android)
      expect(mockMessaging.send).toHaveBeenCalledTimes(2);

      const iosCall = mockMessaging.send.mock.calls.find(
        (c) => c[0].token === 'token-ios',
      );
      expect(iosCall).toBeDefined();
      expect(iosCall![0].apns).toBeDefined();

      const androidCall = mockMessaging.send.mock.calls.find(
        (c) => c[0].token === 'token-android',
      );
      expect(androidCall).toBeDefined();
      expect(androidCall![0].android).toBeDefined();
      expect(androidCall![0].android.notification.channelId).toBe(
        'high_priority',
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      const devices = [
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token-ios',
          platform: DevicePlatform.IOS,
          isActive: true,
          deviceId: null,
          appVersion: null,
          createdAt: DateUtil.now(),
          updatedAt: DateUtil.now(),
        },
      ];

      mockMessaging.send.mockRejectedValue(new Error('FCM Error'));

      // The send method uses Promise.allSettled and logs errors, it doesn't throw them up
      await expect(service.send(baseDto, devices)).resolves.not.toThrow();
    });
  });
});

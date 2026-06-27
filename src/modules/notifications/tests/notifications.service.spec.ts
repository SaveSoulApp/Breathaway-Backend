import { EventEmitter2 } from '@nestjs/event-emitter';
import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { EmailService } from '../email/email.service';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';
import { FcmProviderService } from '../providers/fcm.provider.service';
import { WhatsAppProviderService } from '../providers/whatsapp.provider.service';
import { PreferencesService } from '@modules/preferences/preferences.service';
import { ClsService } from 'nestjs-cls';

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

    // Default mock behavior for preferences
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
    it('should query devices and call fcmProvider if PUSH is requested', async () => {
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

      (prismaService.device.findMany as jest.Mock).mockResolvedValue(
        mockDevices,
      );
      fcmProvider.send.mockResolvedValue();

      const prefMap = new Map();
      prefMap.set('user-1', { pushEnabled: true });
      preferencesService.getPreferencesMany.mockResolvedValue(prefMap);

      await service.processSendRequest(dto);

      expect(prismaService.device.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-1'] },
          isActive: true,
        },
      });
      expect(fcmProvider.send).toHaveBeenCalledWith(dto, mockDevices);
      expect(emailService.send).not.toHaveBeenCalled();
      expect(whatsAppProvider.send).not.toHaveBeenCalled();
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

      // The processSendRequest shouldn't throw, it should use Promise.allSettled and log
      await expect(service.processSendRequest(dto)).resolves.not.toThrow();
    });
  });
});

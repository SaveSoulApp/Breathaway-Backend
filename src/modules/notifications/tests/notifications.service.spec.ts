import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubEvent } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';
import { EmailProviderService } from '../providers/email.provider.service';
import { FcmProviderService } from '../providers/fcm.provider.service';
import { WhatsAppProviderService } from '../providers/whatsapp.provider.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let pubSubPublisherService: jest.Mocked<PubSubPublisherService>;
  let prismaService: jest.Mocked<PrismaService>;
  let fcmProvider: jest.Mocked<FcmProviderService>;
  let emailProvider: jest.Mocked<EmailProviderService>;
  let whatsAppProvider: jest.Mocked<WhatsAppProviderService>;

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
        NotificationsService,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PubSubPublisherService, useValue: mockPubSub },
        { provide: FcmProviderService, useValue: mockFcm },
        { provide: EmailProviderService, useValue: mockEmail },
        { provide: WhatsAppProviderService, useValue: mockWhatsApp },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    pubSubPublisherService = module.get(PubSubPublisherService);
    prismaService = module.get(PrismaService);
    fcmProvider = module.get(FcmProviderService);
    emailProvider = module.get(EmailProviderService);
    whatsAppProvider = module.get(WhatsAppProviderService);
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prismaService.device.findMany as jest.Mock).mockResolvedValue(
        mockDevices,
      );
      fcmProvider.send.mockResolvedValue();

      await service.processSendRequest(dto);

      expect(prismaService.device.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-1'] },
          isActive: true,
        },
      });
      expect(fcmProvider.send).toHaveBeenCalledWith(dto, mockDevices);
      expect(emailProvider.send).not.toHaveBeenCalled();
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
      emailProvider.send.mockResolvedValue();
      whatsAppProvider.send.mockResolvedValue();

      await service.processSendRequest(dto);

      expect(fcmProvider.send).toHaveBeenCalled();
      expect(emailProvider.send).toHaveBeenCalledWith(dto);
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

      emailProvider.send.mockRejectedValue(new Error('Email failed'));

      // The processSendRequest shouldn't throw, it should use Promise.allSettled and log
      await expect(service.processSendRequest(dto)).resolves.not.toThrow();
    });
  });
});

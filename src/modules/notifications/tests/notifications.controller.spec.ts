import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from '@core/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { SendNotificationRequestDto } from '../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from '../notifications.service';
import { ClsService } from 'nestjs-cls';

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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should successfully dispatch a notification request', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        channels: [NotificationChannel.PUSH],
        title: 'Test Notification',
        body: 'This is a test notification.',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      service.dispatch.mockResolvedValue();

      const result = await controller.send(dto);

      expect(service.dispatch).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        success: true,
        message: 'Notification dispatch requested for 1 users',
        userCount: 1,
      });
    });
  });
});

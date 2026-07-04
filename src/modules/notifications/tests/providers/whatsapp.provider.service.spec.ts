import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from '@core/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { SendNotificationRequestDto } from '../../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationType } from '../../enums/notification-type.enum';
import { WhatsAppProviderService } from '../../providers/whatsapp.provider.service';
import { ClsService } from 'nestjs-cls';

describe('WhatsAppProviderService', () => {
  let service: WhatsAppProviderService;
  let loggerService: LoggerService;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        WhatsAppProviderService,
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<WhatsAppProviderService>(WhatsAppProviderService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should return early if no userIds are provided', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: [],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      await service.send(dto);

      const mockContextualLogger = (loggerService.forContext as jest.Mock)();
      expect(mockContextualLogger.warn).not.toHaveBeenCalled();
    });

    it('should log a warning when userIds are provided (placeholder behavior)', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1', 'user-2'],
        title: 'Title',
        body: 'Body',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      };

      await service.send(dto);

      const mockContextualLogger = (loggerService.forContext as jest.Mock)();
      expect(mockContextualLogger.warn).toHaveBeenCalledWith(
        'WhatsApp provider not yet fully implemented. Skipping send.',
        {
          userCount: 2,
          step: 'send',
        },
      );
    });
  });
});

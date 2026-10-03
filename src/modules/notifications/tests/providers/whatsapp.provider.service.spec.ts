import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { DateUtil } from '@common/utils/date.utils';
import { LoggerService } from '@core/logger';

import { SendNotificationRequestDto } from '../../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationType } from '../../enums/notification-type.enum';
import { WhatsAppProviderService } from '../../providers/whatsapp.provider.service';
import { NotificationRecipientResolverService } from '../../recipient/notification-recipient-resolver.service';
import {
  IWhatsAppAdapter,
  WHATSAPP_ADAPTER_TOKEN,
} from '../../whatsapp/adapters/whatsapp-adapter.interface';

describe('WhatsAppProviderService', () => {
  let service: WhatsAppProviderService;
  let mockRecipientResolver: {
    resolvePhoneNumbers: jest.Mock;
    resolveEmails: jest.Mock;
  };
  let whatsAppAdapter: IWhatsAppAdapter;

  const mockContextualLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  const mockLogger = {
    forContext: jest.fn().mockReturnValue(mockContextualLogger),
  };

  const mockWhatsAppAdapter = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    mockRecipientResolver = {
      resolvePhoneNumbers: jest.fn(),
      resolveEmails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppProviderService,
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: NotificationRecipientResolverService,
          useValue: mockRecipientResolver,
        },
        { provide: WHATSAPP_ADAPTER_TOKEN, useValue: mockWhatsAppAdapter },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<WhatsAppProviderService>(WhatsAppProviderService);
    whatsAppAdapter = module.get<IWhatsAppAdapter>(WHATSAPP_ADAPTER_TOKEN);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should return early if no userIds are provided', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: [],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
      };

      await service.send(dto);

      expect(mockRecipientResolver.resolvePhoneNumbers).not.toHaveBeenCalled();
      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should return early if notification type has no WhatsApp template mapped', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.IDENTITY_REMOVED,
        category: NotificationCategory.SECURITY,
      };

      await service.send(dto);

      expect(mockRecipientResolver.resolvePhoneNumbers).not.toHaveBeenCalled();
      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should return early if no phone numbers can be resolved', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValueOnce(
        new Map(),
      );

      await service.send(dto);

      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should resolve phone contact from recipientResolver and send via adapter', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: {
          matchId: 'match-123',
        },
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValueOnce(
        new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              phoneDigits: '919876543210',
              e164Formatted: '+919876543210',
              firstName: 'TestUser',
            },
          ],
        ]),
      );

      mockWhatsAppAdapter.send.mockResolvedValueOnce(undefined);

      await service.send(dto);

      expect(mockWhatsAppAdapter.send).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledWith({
        to: '919876543210',
        template: 'breathaway_new_match',
        language: 'en',
        params: undefined,
      });
    });

    it('should send welcome notification template for WELCOME type', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.WELCOME,
        category: NotificationCategory.SYSTEM,
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValueOnce(
        new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              phoneDigits: '919876543210',
              e164Formatted: '+919876543210',
              firstName: 'TestUser',
            },
          ],
        ]),
      );

      mockWhatsAppAdapter.send.mockResolvedValueOnce(undefined);

      await service.send(dto);

      expect(mockWhatsAppAdapter.send).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledWith({
        to: '919876543210',
        template: 'breathaway_new_user_login',
        language: 'en',
        params: undefined,
      });
    });

    it('should dispatch concurrently for multiple userIds', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1', 'user-2'],
        type: NotificationType.WELCOME,
        category: NotificationCategory.SYSTEM,
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValueOnce(
        new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              phoneDigits: '919876543210',
              e164Formatted: '+919876543210',
            },
          ],
          [
            'user-2',
            {
              userId: 'user-2',
              phoneDigits: '919876543211',
              e164Formatted: '+919876543211',
            },
          ],
        ]),
      );

      mockWhatsAppAdapter.send
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await service.send(dto);

      expect(mockWhatsAppAdapter.send).toHaveBeenCalledTimes(2);
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '919876543210' }),
      );
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '919876543211' }),
      );
    });

    it('should suppress duplicate match notifications for the same match and user', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: {
          matchId: 'match-dup-1',
        },
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValue(
        new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              phoneDigits: '919876543210',
              e164Formatted: '+919876543210',
            },
          ],
        ]),
      );
      mockWhatsAppAdapter.send.mockResolvedValue(undefined);

      // First dispatch: should send
      await service.send(dto);
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledTimes(1);

      // Second dispatch with same matchId and userId: should be suppressed
      await service.send(dto);
      expect(mockWhatsAppAdapter.send).toHaveBeenCalledTimes(1);
    });

    it('should catch adapter errors and not throw to the caller', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: {
          matchId: 'match-err-1',
        },
      };

      mockRecipientResolver.resolvePhoneNumbers.mockResolvedValueOnce(
        new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              phoneDigits: '919876543210',
              e164Formatted: '+919876543210',
            },
          ],
        ]),
      );
      mockWhatsAppAdapter.send.mockRejectedValueOnce(
        new Error('LiteApp server error'),
      );

      // Should complete without throwing
      await expect(service.send(dto)).resolves.not.toThrow();
      expect(mockContextualLogger.error).toHaveBeenCalledWith(
        'Failed to send WhatsApp notification to recipient',
        expect.objectContaining({
          userId: 'user-1',
          template: 'breathaway_new_match',
        }),
      );
    });

    it('should prune in-memory cache when size limit is reached', async () => {
      const inMemoryMap = (
        service as unknown as { inMemorySentKeys: Map<string, number> }
      ).inMemorySentKeys;
      const oldTimestamp = DateUtil.now().getTime() - 25 * 60 * 60 * 1000; // 25 hours ago (expired)

      for (let i = 0; i < 5000; i++) {
        inMemoryMap.set(`key-expired-${i}`, oldTimestamp);
      }

      expect(inMemoryMap.size).toBe(5000);

      const isDup = await (
        service as unknown as {
          isDuplicateAndMark: (k: string) => Promise<boolean>;
        }
      ).isDuplicateAndMark('new-key');
      expect(isDup).toBe(false);
      expect(inMemoryMap.size).toBe(1);
      expect(inMemoryMap.has('new-key')).toBe(true);
    });
  });
});

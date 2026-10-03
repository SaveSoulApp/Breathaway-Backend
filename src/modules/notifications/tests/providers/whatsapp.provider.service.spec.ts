import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialType, IdentityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { SendNotificationRequestDto } from '../../dto/request/send-notification.request.dto';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { NotificationType } from '../../enums/notification-type.enum';
import { WhatsAppProviderService } from '../../providers/whatsapp.provider.service';
import {
  IWhatsAppAdapter,
  WHATSAPP_ADAPTER_TOKEN,
} from '../../whatsapp/adapters/whatsapp-adapter.interface';

describe('WhatsAppProviderService', () => {
  let service: WhatsAppProviderService;
  let prisma: PrismaService;
  let identityCryptoService: IdentityCryptoService;
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

  const mockPrisma = {
    authCredential: {
      findMany: jest.fn(),
    },
    identity: {
      findMany: jest.fn(),
    },
  };

  const mockCryptoService = {
    decryptPublicValue: jest.fn(),
  };

  const mockWhatsAppAdapter = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppProviderService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdentityCryptoService, useValue: mockCryptoService },
        { provide: WHATSAPP_ADAPTER_TOKEN, useValue: mockWhatsAppAdapter },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<WhatsAppProviderService>(WhatsAppProviderService);
    prisma = module.get<PrismaService>(PrismaService);
    identityCryptoService = module.get<IdentityCryptoService>(
      IdentityCryptoService,
    );
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

      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should return early if notification type has no WhatsApp template mapped', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.IDENTITY_REMOVED,
        category: NotificationCategory.SECURITY,
      };

      await service.send(dto);

      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should return early if no phone numbers can be resolved', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
      };

      mockPrisma.authCredential.findMany.mockResolvedValueOnce([]);
      mockPrisma.identity.findMany.mockResolvedValueOnce([]);

      await service.send(dto);

      expect(mockWhatsAppAdapter.send).not.toHaveBeenCalled();
    });

    it('should resolve phone number from AuthCredential and send via adapter', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: {
          matchId: 'match-123',
        },
      };

      mockPrisma.authCredential.findMany.mockResolvedValueOnce([
        {
          userId: 'user-1',
          type: AuthCredentialType.PHONE,
          identity: {
            publicValueCiphertext: 'cipher-1',
            publicValueIv: 'iv-1',
            publicValueTag: 'tag-1',
            publicValueWrappedKey: 'key-1',
            publicValueKeyId: 'key-id-1',
          },
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '+91 98765 43210',
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

    it('should fallback to Identity record when AuthCredential is not found', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.WELCOME,
        category: NotificationCategory.SYSTEM,
      };

      mockPrisma.authCredential.findMany.mockResolvedValueOnce([]);
      mockPrisma.identity.findMany.mockResolvedValueOnce([
        {
          userId: 'user-1',
          type: IdentityType.PHONE,
          publicValueCiphertext: 'cipher-2',
          publicValueIv: 'iv-2',
          publicValueTag: 'tag-2',
          publicValueWrappedKey: 'key-2',
          publicValueKeyId: 'key-id-2',
        },
      ]);

      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '919876543210',
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

    it('should suppress duplicate match notifications for the same match and user', async () => {
      const dto: SendNotificationRequestDto = {
        userIds: ['user-1'],
        type: NotificationType.NEW_MATCH,
        category: NotificationCategory.SOCIAL,
        payload: {
          matchId: 'match-dup-1',
        },
      };

      mockPrisma.authCredential.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          type: AuthCredentialType.PHONE,
          identity: {
            publicValueCiphertext: 'cipher-1',
          },
        },
      ]);
      mockCryptoService.decryptPublicValue.mockResolvedValue('919876543210');
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

      mockPrisma.authCredential.findMany.mockResolvedValueOnce([
        {
          userId: 'user-1',
          type: AuthCredentialType.PHONE,
          identity: {
            publicValueCiphertext: 'cipher-1',
          },
        },
      ]);
      mockCryptoService.decryptPublicValue.mockResolvedValueOnce(
        '919876543210',
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
  });
});

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LOG_EVENT, LoggerService } from '@core/logger';

import { MetaWebhookDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
import { PurchaseEventType } from '../enums/purchase-event-type.enum';
import {
  WebhookMessageHandler,
  WebhookPurchaseHandler,
} from '../handlers/webhook-handler.interface';
import { ParsedPurchaseEvent } from '../interfaces/purchase-event.interface';
import {
  WEBHOOK_MESSAGE_HANDLERS,
  WEBHOOK_PURCHASE_HANDLERS,
} from '../webhooks.constants';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    event: jest.Mock;
    verbose: jest.Mock;
  };
  let logger: {
    forContext: jest.Mock;
  };
  let mockHandler1: jest.Mocked<WebhookMessageHandler>;
  let mockHandler2: jest.Mocked<WebhookMessageHandler>;
  let mockPurchaseHandler: jest.Mocked<WebhookPurchaseHandler>;

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

    logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockHandler1 = {
      canHandle: jest.fn().mockReturnValue(false),
      handle: jest.fn().mockResolvedValue(undefined),
    };

    mockHandler2 = {
      canHandle: jest.fn().mockReturnValue(false),
      handle: jest.fn().mockResolvedValue(undefined),
    };

    mockPurchaseHandler = {
      canHandle: jest.fn().mockReturnValue(false),
      handle: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        WebhooksService,
        { provide: ConfigService, useValue: configService },
        {
          provide: WEBHOOK_MESSAGE_HANDLERS,
          useValue: [mockHandler1, mockHandler2],
        },
        {
          provide: WEBHOOK_PURCHASE_HANDLERS,
          useValue: [mockPurchaseHandler],
        },
        {
          provide: LoggerService,
          useValue: logger as unknown as LoggerService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('verifyMetaWebhook', () => {
    it('should verify webhook successfully', async () => {
      configService.get.mockReturnValue('my_secret_token');
      const result = await service.verifyMetaWebhook(
        'subscribe',
        'my_secret_token',
        'challenge_string',
      );
      expect(result).toBe('challenge_string');
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Meta webhook verification started',
        { mode: 'subscribe', step: 'verify' },
      );
      expect(contextualLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.META_WEBHOOK_VERIFIED,
        expect.objectContaining({ mode: 'subscribe' }),
      );
    });

    it('should fail verification if mode is not subscribe', async () => {
      configService.get.mockReturnValue('my_secret_token');
      const result = await service.verifyMetaWebhook(
        'unsubscribe',
        'my_secret_token',
        'challenge_string',
      );
      expect(result).toBe('Verification failed');
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Meta webhook verification started',
        { mode: 'unsubscribe', step: 'verify' },
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook verification failed',
        { mode: 'unsubscribe', step: 'verify' },
      );
    });

    it('should fail verification if token mismatches', async () => {
      configService.get.mockReturnValue('my_secret_token');
      const result = await service.verifyMetaWebhook(
        'subscribe',
        'wrong_token',
        'challenge_string',
      );
      expect(result).toBe('Verification failed');
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Meta webhook verification started',
        { mode: 'subscribe', step: 'verify' },
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook verification failed',
        { mode: 'subscribe', step: 'verify' },
      );
    });
  });

  describe('parseMetaWebhook', () => {
    it('should parse webhook entry with MESSAGE intent', () => {
      const payload: MetaWebhookDto = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-1',
            time: 1234567,
            messaging: [
              {
                sender: { id: 'sender-1' },
                recipient: { id: 'recipient-1' },
                timestamp: 1234567,
                message: { mid: 'mid-1', text: 'Hello' },
              },
            ],
          },
        ],
      };

      const results = service.parseMetaWebhook(payload);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        intent: MetaWebhookIntent.MESSAGE,
        platform: 'instagram',
        entryId: 'entry-1',
        messages: [
          {
            senderId: 'sender-1',
            recipientId: 'recipient-1',
            messageId: 'mid-1',
            text: 'Hello',
            timestamp: 1234567,
          },
        ],
      });
    });

    it('should parse webhook entry with UNKNOWN intent', () => {
      const payload: MetaWebhookDto = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-2',
            time: 1234567,
          },
        ],
      };

      const results = service.parseMetaWebhook(payload);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        intent: MetaWebhookIntent.UNKNOWN,
        platform: 'instagram',
        entryId: 'entry-2',
        messages: [],
      });
    });
  });

  describe('handleMetaWebhookEvents', () => {
    it('should handle MESSAGE intent using the first matching handler', async () => {
      const results = [
        {
          intent: MetaWebhookIntent.MESSAGE,
          platform: 'instagram',
          entryId: 'entry-1',
          messages: [
            {
              senderId: 'sender-1',
              recipientId: 'recipient-1',
              messageId: 'mid-1',
              text: 'hello',
              timestamp: 1234567890,
            },
          ],
        },
      ];

      mockHandler1.canHandle.mockReturnValue(true);

      await service.handleMetaWebhookEvents(results);

      expect(mockHandler1.canHandle).toHaveBeenCalledWith(
        results[0].messages[0],
      );
      expect(mockHandler1.handle).toHaveBeenCalledWith(results[0].messages[0]);
      expect(mockHandler2.canHandle).not.toHaveBeenCalled();
      expect(mockHandler2.handle).not.toHaveBeenCalled();
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Instagram message received',
        {
          senderId: 'sender-1',
          recipientId: 'recipient-1',
          messageId: 'mid-1',
          step: 'receive_message',
          hasText: true,
          textLength: 5,
          messageTimestamp: expect.any(String),
        },
      );
    });

    it('should log an error and rethrow if message handler fails', async () => {
      const results = [
        {
          intent: MetaWebhookIntent.MESSAGE,
          platform: 'instagram',
          entryId: 'entry-1',
          messages: [
            {
              senderId: 'sender-1',
              recipientId: 'recipient-1',
              messageId: 'mid-1',
              text: 'hello',
              timestamp: 1234567890,
            },
          ],
        },
      ];

      mockHandler1.canHandle.mockReturnValue(true);
      const handlerError = new Error('Handler Failure');
      mockHandler1.handle.mockRejectedValue(handlerError);

      await expect(service.handleMetaWebhookEvents(results)).rejects.toThrow(
        handlerError,
      );

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to handle Instagram message',
        expect.objectContaining({
          senderId: 'sender-1',
          recipientId: 'recipient-1',
          messageId: 'mid-1',
          step: 'handle_message',
          handler: 'Object',
          err: expect.objectContaining({
            message: handlerError.message,
            name: handlerError.name,
            stack: handlerError.stack,
          }),
        }),
      );
    });

    it('should warn for UNKNOWN intent', async () => {
      const results = [
        {
          intent: MetaWebhookIntent.UNKNOWN,
          platform: 'instagram',
          entryId: 'entry-2',
          messages: [],
        },
      ];

      await service.handleMetaWebhookEvents(results);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Unhandled webhook intent',
        {
          entryId: 'entry-2',
          platform: 'instagram',
          intent: MetaWebhookIntent.UNKNOWN,
          step: 'intent_routing',
        },
      );
    });
  });

  describe('parseRevenueCatWebhook', () => {
    it('should delegate to parseRevenueCatWebhook util and return parsed event', () => {
      // Arrange
      const rawPayload = {
        api_version: '1.0',
        event: {
          type: 'NON_RENEWING_PURCHASE',
          id: 'rc-evt-1',
          app_user_id: 'user-1',
        },
      };

      // Act
      const result = service.parseRevenueCatWebhook(rawPayload);

      // Assert
      expect(result).toBeDefined();
      expect(result.gatewayEventId).toBe('rc-evt-1');
      expect(result.candidateUserIds).toContain('user-1');
    });
  });

  describe('handlePurchaseEvent', () => {
    const validEvent: ParsedPurchaseEvent = {
      gateway: 'REVENUECAT' as any,
      type: PurchaseEventType.PURCHASE,
      providerEventType: 'NON_RENEWING_PURCHASE',
      gatewayTransactionId: 'txn-1',
      gatewayEventId: 'evt-1',
      gatewayUserId: 'user-1',
      productId: 'credit_pack_10',
      environment: 'SANDBOX' as any,
      channel: null,
      amount: 10,
      currency: 'USD',
      countryCode: 'US',
      occurredAt: new Date(),
      candidateUserIds: ['user-1'],
      raw: {},
    };

    it('should ignore and drop event when event type is UNKNOWN', async () => {
      // Arrange
      const unknownEvent: ParsedPurchaseEvent = {
        ...validEvent,
        type: PurchaseEventType.UNKNOWN,
      };

      // Act
      await service.handlePurchaseEvent(unknownEvent);

      // Assert
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Ignoring unhandled purchase event type',
        expect.objectContaining({
          gateway: 'REVENUECAT',
          step: 'event_routing',
        }),
      );
      expect(mockPurchaseHandler.canHandle).not.toHaveBeenCalled();
      expect(mockPurchaseHandler.handle).not.toHaveBeenCalled();
    });

    it('should route event to the first matching purchase handler and stop', async () => {
      // Arrange
      mockPurchaseHandler.canHandle.mockReturnValue(true);
      mockPurchaseHandler.handle.mockResolvedValue(undefined);

      // Act
      await service.handlePurchaseEvent(validEvent);

      // Assert
      expect(mockPurchaseHandler.canHandle).toHaveBeenCalledWith(validEvent);
      expect(mockPurchaseHandler.handle).toHaveBeenCalledWith(validEvent);
    });

    it('should log error and rethrow when purchase handler fails', async () => {
      // Arrange
      const handlerError = new Error('Purchase processor failure');
      mockPurchaseHandler.canHandle.mockReturnValue(true);
      mockPurchaseHandler.handle.mockRejectedValue(handlerError);

      // Act & Assert
      await expect(service.handlePurchaseEvent(validEvent)).rejects.toThrow(
        handlerError,
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to handle purchase event',
        expect.objectContaining({
          gateway: 'REVENUECAT',
          step: 'handle_purchase',
        }),
      );
    });

    it('should log warning when no handler claims the event', async () => {
      // Arrange
      mockPurchaseHandler.canHandle.mockReturnValue(false);

      // Act
      await service.handlePurchaseEvent(validEvent);

      // Assert
      expect(mockPurchaseHandler.canHandle).toHaveBeenCalledWith(validEvent);
      expect(mockPurchaseHandler.handle).not.toHaveBeenCalled();
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'No handler claimed purchase event',
        expect.objectContaining({
          gateway: 'REVENUECAT',
          step: 'event_routing',
        }),
      );
    });
  });
});

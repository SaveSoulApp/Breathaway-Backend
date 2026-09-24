import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { MetaWebhookDto, RevenueCatWebhookRequestDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
import { RevenueCatWebhookGuard } from '../guards';
import { MetaWebhookResult } from '../interfaces/meta-webhook-result.interface';
import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: jest.Mocked<WebhooksService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    contextualLogger = {
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
      verifyMetaWebhook: jest.fn(),
      parseMetaWebhook: jest.fn(),
      handleMetaWebhookEvents: jest.fn(),
      parseRevenueCatWebhook: jest.fn(),
      handlePurchaseEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WebhooksService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    })
      .overrideGuard(RevenueCatWebhookGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyWebhook', () => {
    it('should pass query params to the service and return the result', async () => {
      const mode = 'subscribe';
      const token = 'my_verify_token';
      const challenge = '1158201444';

      service.verifyMetaWebhook.mockResolvedValue(challenge);

      const result = await controller.verifyWebhook(mode, token, challenge);

      expect(service.verifyMetaWebhook).toHaveBeenCalledWith(
        mode,
        token,
        challenge,
      );
      expect(result).toBe(challenge);
    });
  });

  describe('handleMetaWebhook', () => {
    it('should parse webhook payload, handle events and return EVENT_RECEIVED', async () => {
      const payload: MetaWebhookDto = {
        object: 'instagram',
        entry: [
          {
            id: '12345',
            time: 1234567890,
            messaging: [
              {
                sender: { id: 'sender-1' },
                recipient: { id: 'recipient-1' },
                timestamp: 1234567890,
                message: { mid: 'mid-1', text: 'hello' },
              },
            ],
          },
        ],
      };

      const parsedResults: MetaWebhookResult[] = [
        {
          intent: MetaWebhookIntent.MESSAGE,
          platform: 'instagram',
          entryId: '12345',
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

      service.parseMetaWebhook.mockReturnValue(parsedResults);
      service.handleMetaWebhookEvents.mockResolvedValue(undefined);

      const result = await controller.handleMetaWebhook(payload);

      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Meta webhook received',
        { object: payload.object },
      );
      expect(service.parseMetaWebhook).toHaveBeenCalledWith(payload);
      expect(service.handleMetaWebhookEvents).toHaveBeenCalledWith(
        parsedResults,
      );
      expect(result).toBe('EVENT_RECEIVED');
    });
  });

  describe('handleRevenueCatWebhook', () => {
    it('should parse payload, dispatch purchase event, and return status ok', async () => {
      // Arrange
      const dto: RevenueCatWebhookRequestDto = {
        api_version: '1.0',
        event: {
          id: 'evt-100',
          type: 'NON_RENEWING_PURCHASE',
          app_user_id: 'user-123',
          product_id: 'credit_pack_10',
          transaction_id: 'txn-100',
        },
      };

      const parsedEvent = {
        gateway: 'REVENUECAT' as any,
        providerEventType: 'NON_RENEWING_PURCHASE',
        gatewayTransactionId: 'txn-100',
        productId: 'credit_pack_10',
        environment: 'SANDBOX' as any,
      } as any;

      service.parseRevenueCatWebhook.mockReturnValue(parsedEvent);
      service.handlePurchaseEvent.mockResolvedValue(undefined);

      // Act
      const result = await controller.handleRevenueCatWebhook(dto);

      // Assert
      expect(service.parseRevenueCatWebhook).toHaveBeenCalledWith(dto);
      expect(service.handlePurchaseEvent).toHaveBeenCalledWith(parsedEvent);
      expect(result).toEqual({ status: 'ok' });
    });

    it('should answer status ok even for test events when parsed event is dispatched', async () => {
      // Arrange
      const dto: RevenueCatWebhookRequestDto = {
        api_version: '1.0',
        event: {
          id: 'evt-test',
          type: 'TEST',
          app_user_id: 'test-user',
        },
      };

      const parsedEvent = {
        gateway: 'REVENUECAT' as any,
        providerEventType: 'TEST',
        gatewayTransactionId: null,
        productId: null,
        environment: 'SANDBOX' as any,
      } as any;

      service.parseRevenueCatWebhook.mockReturnValue(parsedEvent);
      service.handlePurchaseEvent.mockResolvedValue(undefined);

      // Act
      const result = await controller.handleRevenueCatWebhook(dto);

      // Assert
      expect(service.parseRevenueCatWebhook).toHaveBeenCalledWith(dto);
      expect(service.handlePurchaseEvent).toHaveBeenCalledWith(parsedEvent);
      expect(result).toEqual({ status: 'ok' });
    });
  });
});

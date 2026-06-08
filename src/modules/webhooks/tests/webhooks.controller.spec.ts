import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';

import { MetaWebhookDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WebhooksService, useValue: mockService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

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

      expect(contextualLogger.log).toHaveBeenCalledWith(
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
});

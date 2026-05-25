import { LoggerService } from '@core/logger';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WEBHOOK_MESSAGE_HANDLERS } from '../webhooks.constants';
import { WebhookMessageHandler } from '../handlers/webhook-message.handler.interface';
import { MetaWebhookDto } from '../dto';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };
  let logger: {
    forContext: jest.Mock;
  };
  let mockHandler1: jest.Mocked<WebhookMessageHandler>;
  let mockHandler2: jest.Mocked<WebhookMessageHandler>;

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: ConfigService, useValue: configService },
        {
          provide: WEBHOOK_MESSAGE_HANDLERS,
          useValue: [mockHandler1, mockHandler2],
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
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Meta webhook verified successfully',
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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook verification failed',
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
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Meta webhook verification failed',
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
          intent: MetaWebhookIntent.UNKNOWN,
          entryId: 'entry-2',
        },
      );
    });
  });
});

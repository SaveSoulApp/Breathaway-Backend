import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@core/logger';
import { WebhooksService } from '../webhooks.service';
import { MetaWebhookIntent } from '../enums/meta-webhook-intent.enum';
import { MetaWebhookDto } from '../dto';
import * as parserUtils from '../utils/meta-webhook.parser';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: any;
  let logger: any;

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
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
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
    it('should handle MESSAGE intent', async () => {
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

      await service.handleMetaWebhookEvents(results);

      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Instagram message received',
        {
          senderId: 'sender-1',
          recipientId: 'recipient-1',
          messageId: 'mid-1',
          text: 'hello',
          timestamp: new Date(1234567890).toISOString(),
        },
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
          intent: MetaWebhookIntent.UNKNOWN,
          entryId: 'entry-2',
        },
      );
    });
  });
});

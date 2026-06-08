import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Test, TestingModule } from '@nestjs/testing';
import { GenericMessageHandler } from '../handlers/generic-message.handler';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';
import { ClsService } from 'nestjs-cls';

describe('GenericMessageHandler', () => {
  let handler: GenericMessageHandler;
  let pubsubPublisher: jest.Mocked<PubSubPublisherService>;
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

    const mockPubsubPublisher = {
      publish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        GenericMessageHandler,
        { provide: LoggerService, useValue: logger },
        { provide: PubSubPublisherService, useValue: mockPubsubPublisher },
      ],
    }).compile();

    handler = module.get<GenericMessageHandler>(GenericMessageHandler);
    pubsubPublisher = module.get(PubSubPublisherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should always return true as a fallback', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'any random text',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });
  });

  describe('handle', () => {
    it('should publish a generic MESSAGE_RECEIVED event', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'hello',
        timestamp: 123456,
      };

      await handler.handle(message);

      expect(pubsubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.META_WEBHOOKS,
        PubSubEvent.META_WEBHOOK_RECEIVED,
        {
          messageId: message.messageId,
          text: message.text,
          senderId: message.senderId,
          recipientId: message.recipientId,
          timestamp: message.timestamp,
        },
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Published generic message event for message mid',
      );
    });

    it('should log an error if publish fails', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'hello',
        timestamp: 123456,
      };

      const error = new Error('PubSub Error');
      pubsubPublisher.publish.mockRejectedValue(error);

      await handler.handle(message);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to publish generic message event: PubSub Error',
      );
    });
  });
});

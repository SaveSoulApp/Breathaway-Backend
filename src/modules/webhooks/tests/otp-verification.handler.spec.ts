import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Test, TestingModule } from '@nestjs/testing';
import { OtpVerificationHandler } from '../handlers/otp-verification.handler';
import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';

describe('OtpVerificationHandler', () => {
  let handler: OtpVerificationHandler;
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        OtpVerificationHandler,
        { provide: LoggerService, useValue: logger },
        { provide: PubSubPublisherService, useValue: mockPubsubPublisher },
      ],
    }).compile();

    handler = module.get<OtpVerificationHandler>(OtpVerificationHandler);
    pubsubPublisher = module.get(PubSubPublisherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for valid verify OTP messages', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'verify: 123456',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return true for valid verify OTP messages without spaces', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'Verify:123456',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return false for non-verify messages', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'hello there',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should extract OTP and publish an event', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'verify: 987654',
        timestamp: 123456,
      };

      await handler.handle(message);

      expect(pubsubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.INSTAGRAM_OTP_RECEIVED,
        {
          otp: '987654',
          senderId: '123',
          timestamp: 123456,
        },
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Published OTP verification event for sender 123',
      );
    });

    it('should return immediately if match is invalid', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'verify:', // No OTP provided
        timestamp: 123456,
      };

      await handler.handle(message);

      expect(pubsubPublisher.publish).not.toHaveBeenCalled();
    });

    it('should log an error if publish fails', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'verify: 123456',
        timestamp: 123456,
      };

      const error = new Error('PubSub Error');
      pubsubPublisher.publish.mockRejectedValue(error);

      await handler.handle(message);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to publish OTP verification event: PubSub Error',
      );
    });
  });
});

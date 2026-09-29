import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PubSubEvent, PubSubTopic } from '@modules/pubsub/enums';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

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
        { provide: ClsService, useValue: { get: jest.fn() } },
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
    it('should return true for valid legacy verify OTP messages', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'verify: 123456',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return true for valid legacy verify OTP messages without spaces', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'Verify:123456',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return true for natural language messages containing 3-word slug', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'Hey Breathaway! Setting up my account. Verification code: rapid-amber-summit. Thanks a lot!',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return true for natural language messages with punctuation around the slug', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'Hi there, linking my profile (ref: swift-golden-falcon). Cheers!',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return false for non-verify, non-slug messages', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'hello there, how does the Breathaway app work?',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(false);
    });

    it('should return false when message text is empty or missing', () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: '',
        timestamp: 123456,
      };
      expect(handler.canHandle(message)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should extract legacy OTP and publish an event', async () => {
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
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Published OTP verification event for sender 123',
      );
    });

    it('should extract slug from natural language message and publish an event', async () => {
      const message: ParsedInstagramMessage = {
        senderId: 'user-ig-456',
        recipientId: 'breathaway-ig',
        messageId: 'mid-abc',
        text: 'Hey Breathaway! Linking my Instagram profile. Verification code: rapid-amber-summit. Cheers!',
        timestamp: 1727600000,
      };

      await handler.handle(message);

      expect(pubsubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.INSTAGRAM_OTP_RECEIVED,
        {
          otp: 'rapid-amber-summit',
          senderId: 'user-ig-456',
          timestamp: 1727600000,
        },
      );
      expect(contextualLogger.debug).toHaveBeenCalledWith(
        'Published OTP verification event for sender user-ig-456',
      );
    });

    it('should normalize uppercase slugs to lowercase when extracting', async () => {
      const message: ParsedInstagramMessage = {
        senderId: '123',
        recipientId: '456',
        messageId: 'mid',
        text: 'Hello team, my code is Rapid-Amber-Summit. Thank you!',
        timestamp: 123456,
      };

      await handler.handle(message);

      expect(pubsubPublisher.publish).toHaveBeenCalledWith(
        PubSubTopic.IDENTITY_WORKFLOWS,
        PubSubEvent.INSTAGRAM_OTP_RECEIVED,
        {
          otp: 'rapid-amber-summit',
          senderId: '123',
          timestamp: 123456,
        },
      );
    });

    it('should return immediately if match is invalid or empty', async () => {
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

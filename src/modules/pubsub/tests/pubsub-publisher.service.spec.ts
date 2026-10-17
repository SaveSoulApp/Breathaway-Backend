import { PubSub } from '@google-cloud/pubsub';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LOG_EVENT, LoggerService } from '@core/logger';

import { PubSubPublisherService } from '../pubsub-publisher.service';

const mockPublishMessage = jest.fn();
const mockTopic = jest.fn().mockReturnValue({
  publishMessage: mockPublishMessage,
});
const mockClose = jest.fn();

jest.mock('@google-cloud/pubsub', () => {
  return {
    PubSub: jest.fn().mockImplementation(() => {
      return {
        topic: mockTopic,
        close: mockClose,
      };
    }),
  };
});

describe('PubSubPublisherService', () => {
  let service: PubSubPublisherService;
  let mockLogger: {
    log: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
    error: jest.Mock;
    event: jest.Mock;
    forContext: jest.Mock;
  };

  const mockClsService = {
    get: jest.fn(),
    isActive: jest.fn().mockReturnValue(false),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-project-id'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockClsService.isActive.mockReturnValue(false);

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      event: jest.fn(),
      forContext: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: mockClsService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        PubSubPublisherService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<PubSubPublisherService>(PubSubPublisherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publish', () => {
    it('should publish a message successfully', async () => {
      mockPublishMessage.mockResolvedValue('msg-123');

      const result = await service.publish(
        'test-topic',
        'test.event',
        { foo: 'bar' },
        { extra: 'attr' },
      );

      expect(result).toBe('msg-123');
      expect(mockTopic).toHaveBeenCalledWith('test-topic');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: expect.any(Buffer),
        attributes: {
          extra: 'attr',
          eventType: 'test.event',
        },
      });
    });

    it('should attach originRequestId and traceContext to attributes when CLS is active', async () => {
      mockClsService.isActive.mockReturnValue(true);
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'requestId') return 'req-origin-123';
        if (key === 'traceContext') return 'trace-456/span-789;o=1';
        return undefined;
      });
      mockPublishMessage.mockResolvedValue('msg-456');

      await service.publish('test-topic', 'user.created', { foo: 'bar' });

      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: expect.any(Buffer),
        attributes: {
          originRequestId: 'req-origin-123',
          traceContext: 'trace-456/span-789;o=1',
          eventType: 'user.created',
        },
      });
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.PUBSUB_EVENT_PUBLISHED,
        expect.objectContaining({
          originRequestId: 'req-origin-123',
          messageId: 'msg-456',
        }),
      );
    });

    it('should preserve caller-provided originRequestId or traceContext overrides', async () => {
      mockClsService.isActive.mockReturnValue(true);
      mockClsService.get.mockImplementation((key: string) => {
        if (key === 'requestId') return 'cls-req-id';
        if (key === 'traceContext') return 'cls-trace-ctx';
        return undefined;
      });
      mockPublishMessage.mockResolvedValue('msg-789');

      await service.publish(
        'test-topic',
        'user.created',
        { foo: 'bar' },
        {
          originRequestId: 'custom-req-id',
          traceContext: 'custom-trace-ctx',
          extra: 'data',
        },
      );

      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: expect.any(Buffer),
        attributes: {
          originRequestId: 'custom-req-id',
          traceContext: 'custom-trace-ctx',
          extra: 'data',
          eventType: 'user.created',
        },
      });
    });

    it('should throw an error if publishing fails', async () => {
      const error = new Error('Publish failed');
      mockPublishMessage.mockRejectedValue(error);

      await expect(
        service.publish('test-topic', 'test.event', { foo: 'bar' }),
      ).rejects.toThrow(error);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close PubSub client connection', async () => {
      await service.onModuleDestroy();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle close errors gracefully without throwing', async () => {
      mockClose.mockRejectedValue(new Error('Close failed'));
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});

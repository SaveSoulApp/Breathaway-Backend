import { PubSub } from '@google-cloud/pubsub';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

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
    debug: jest.Mock;
    error: jest.Mock;
    forContext: jest.Mock;
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-project-id'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      forContext: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
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

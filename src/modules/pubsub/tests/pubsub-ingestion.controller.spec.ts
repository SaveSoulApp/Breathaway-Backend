import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { GcpOidcAuthGuard } from '@common/guards';
import { LOG_EVENT, LoggerService } from '@core/logger';

import { PubSubPushRequestDto } from '../dto';
import { PubSubIngestionController } from '../pubsub-ingestion.controller';
import { PubSubRegistryService } from '../pubsub-registry.service';

describe('PubSubIngestionController', () => {
  let controller: PubSubIngestionController;
  let registryService: jest.Mocked<PubSubRegistryService>;
  let clsService: { set: jest.Mock; get: jest.Mock };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  const loggerServiceMock = {
    forContext: jest.fn().mockReturnValue(mockLogger),
  };

  beforeEach(async () => {
    registryService = {
      getHandler: jest.fn(),
    } as unknown as jest.Mocked<PubSubRegistryService>;

    clsService = {
      set: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PubSubIngestionController],
      providers: [
        { provide: ClsService, useValue: clsService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PubSubRegistryService, useValue: registryService },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    })
      .overrideGuard(GcpOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<PubSubIngestionController>(
      PubSubIngestionController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ingest', () => {
    it('should successfully decode payload, route to handler, and emit processed event', async () => {
      // Arrange
      const messageId = 'pubsub-msg-123';
      const eventType = 'user.created';
      const payloadData = { userId: 'u-1', name: 'Alice' };
      const base64Data = Buffer.from(JSON.stringify(payloadData)).toString(
        'base64',
      );

      const mockTarget = {};
      const mockMethod = jest.fn().mockResolvedValue(undefined);
      registryService.getHandler.mockReturnValue({
        target: mockTarget,
        method: mockMethod,
      });

      const pushDto: PubSubPushRequestDto = {
        message: {
          data: base64Data,
          messageId,
          publishTime: '2024-01-01T00:00:00.000Z',
          attributes: { eventType },
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act
      await controller.ingest(pushDto as unknown as Record<string, unknown>);

      // Assert
      expect(clsService.set).toHaveBeenCalledWith('requestId', messageId);
      expect(clsService.set).toHaveBeenCalledWith('pubsubMessageId', messageId);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.PUBSUB_MESSAGE_RECEIVED,
        {
          messageId,
          eventType,
        },
      );
      expect(mockMethod).toHaveBeenCalledWith(payloadData, messageId);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.PUBSUB_MESSAGE_PROCESSED,
        {
          messageId,
          eventType,
        },
      );
    });

    it('should handle payload without data attribute by passing empty object to handler', async () => {
      // Arrange
      const messageId = 'pubsub-msg-empty-data';
      const eventType = 'ping';

      const mockTarget = {};
      const mockMethod = jest.fn().mockResolvedValue(undefined);
      registryService.getHandler.mockReturnValue({
        target: mockTarget,
        method: mockMethod,
      });

      const pushDto: PubSubPushRequestDto = {
        message: {
          messageId,
          publishTime: '2024-01-01T00:00:00.000Z',
          attributes: { eventType },
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act
      await controller.ingest(pushDto as unknown as Record<string, unknown>);

      // Assert
      expect(mockMethod).toHaveBeenCalledWith({}, messageId);
    });

    it('should return early and warn when message object is missing', async () => {
      // Arrange
      const pushDto = {
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act
      await controller.ingest(pushDto as Record<string, unknown>);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Ignored invalid payload: missing message object',
        expect.objectContaining({ step: 'ingest_check' }),
      );
      expect(registryService.getHandler).not.toHaveBeenCalled();
    });

    it('should return early and warn when eventType attribute is missing', async () => {
      // Arrange
      const pushDto: PubSubPushRequestDto = {
        message: {
          messageId: 'msg-no-attr',
          publishTime: '2024-01-01T00:00:00.000Z',
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act
      await controller.ingest(pushDto as unknown as Record<string, unknown>);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Ignored message: Missing 'eventType' attribute",
        expect.objectContaining({
          messageId: 'msg-no-attr',
          step: 'ingest_check',
        }),
      );
      expect(registryService.getHandler).not.toHaveBeenCalled();
    });

    it('should return early and warn when no handler is registered for eventType', async () => {
      // Arrange
      registryService.getHandler.mockReturnValue(undefined);

      const pushDto: PubSubPushRequestDto = {
        message: {
          messageId: 'msg-unregistered',
          publishTime: '2024-01-01T00:00:00.000Z',
          attributes: { eventType: 'unknown.event' },
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act
      await controller.ingest(pushDto as unknown as Record<string, unknown>);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Ignored message: No handler registered for eventType',
        expect.objectContaining({
          eventType: 'unknown.event',
          step: 'routing_check',
        }),
      );
    });

    it('should swallow JSON parse error and log error without throwing', async () => {
      // Arrange
      const base64InvalidJson =
        Buffer.from('invalid-json{{{').toString('base64');
      registryService.getHandler.mockReturnValue({
        target: {},
        method: jest.fn(),
      });

      const pushDto: PubSubPushRequestDto = {
        message: {
          data: base64InvalidJson,
          messageId: 'msg-bad-json',
          publishTime: '2024-01-01T00:00:00.000Z',
          attributes: { eventType: 'some.event' },
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act & Assert (does not throw)
      await expect(
        controller.ingest(pushDto as unknown as Record<string, unknown>),
      ).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse JSON data for message',
        expect.objectContaining({
          step: 'decode_payload',
        }),
      );
    });

    it('should rethrow error when handler execution throws', async () => {
      // Arrange
      const handlerError = new Error('Handler processing failed');
      const mockMethod = jest.fn().mockRejectedValue(handlerError);
      registryService.getHandler.mockReturnValue({
        target: {},
        method: mockMethod,
      });

      const pushDto: PubSubPushRequestDto = {
        message: {
          messageId: 'msg-err',
          publishTime: '2024-01-01T00:00:00.000Z',
          attributes: { eventType: 'failing.event' },
        },
        subscription: 'projects/test/subscriptions/sub-1',
      };

      // Act & Assert
      await expect(
        controller.ingest(pushDto as unknown as Record<string, unknown>),
      ).rejects.toThrow(handlerError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing event',
        expect.objectContaining({
          step: 'execute_handler',
        }),
      );
    });
  });
});

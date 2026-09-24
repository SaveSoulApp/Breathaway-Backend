import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { PUBSUB_LISTENER_KEY } from '../pubsub.decorator';
import { PubSubRegistryService } from '../pubsub-registry.service';

describe('PubSubRegistryService', () => {
  let service: PubSubRegistryService;
  let discoveryService: {
    getProviders: jest.Mock;
    getControllers: jest.Mock;
  };
  let metadataScanner: {
    getAllMethodNames: jest.Mock;
  };
  let reflector: {
    get: jest.Mock;
  };

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
    discoveryService = {
      getProviders: jest.fn().mockReturnValue([]),
      getControllers: jest.fn().mockReturnValue([]),
    };
    metadataScanner = {
      getAllMethodNames: jest.fn().mockReturnValue([]),
    };
    reflector = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PubSubRegistryService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DiscoveryService, useValue: discoveryService },
        { provide: MetadataScanner, useValue: metadataScanner },
        { provide: Reflector, useValue: reflector },
        { provide: LoggerService, useValue: loggerServiceMock },
      ],
    }).compile();

    service = module.get<PubSubRegistryService>(PubSubRegistryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit and exploration', () => {
    it('should explore and register methods decorated with @PubSubListener', () => {
      // Arrange
      class TestHandler {
        handleUserCreated() {}
        regularMethod() {}
      }

      const instance = new TestHandler();
      const wrapper = {
        isDependencyTreeStatic: () => true,
        instance,
      } as unknown as InstanceWrapper;

      discoveryService.getProviders.mockReturnValue([wrapper]);
      discoveryService.getControllers.mockReturnValue([]);
      metadataScanner.getAllMethodNames.mockReturnValue([
        'handleUserCreated',
        'regularMethod',
      ]);

      reflector.get.mockImplementation(
        (key: string, method: (...args: unknown[]) => unknown) => {
          if (
            key === PUBSUB_LISTENER_KEY &&
            method === instance.handleUserCreated
          ) {
            return 'user.created';
          }
          return undefined;
        },
      );

      // Act
      service.onModuleInit();

      // Assert
      const handler = service.getHandler('user.created');
      expect(handler).toBeDefined();
      expect(handler?.target).toBe(instance);
      expect(handler?.method).toBe(instance.handleUserCreated);
    });

    it('should overwrite duplicate @PubSubListener registrations and log a warning', () => {
      // Arrange
      class HandlerA {
        handlerMethod() {}
      }
      class HandlerB {
        handlerMethod() {}
      }

      const instanceA = new HandlerA();
      const instanceB = new HandlerB();

      const wrapperA = {
        isDependencyTreeStatic: () => true,
        instance: instanceA,
      } as unknown as InstanceWrapper;
      const wrapperB = {
        isDependencyTreeStatic: () => true,
        instance: instanceB,
      } as unknown as InstanceWrapper;

      discoveryService.getProviders.mockReturnValue([wrapperA, wrapperB]);
      discoveryService.getControllers.mockReturnValue([]);
      metadataScanner.getAllMethodNames.mockReturnValue(['handlerMethod']);
      reflector.get.mockReturnValue('duplicate.event');

      // Act
      service.onModuleInit();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Duplicate @PubSubListener found, overwriting existing handler',
        expect.objectContaining({ eventType: 'duplicate.event' }),
      );
      const handler = service.getHandler('duplicate.event');
      expect(handler?.target).toBe(instanceB);
    });

    it('should ignore instances that are not static or have null prototype', () => {
      // Arrange
      const nonStaticWrapper = {
        isDependencyTreeStatic: () => false,
        instance: {},
      } as unknown as InstanceWrapper;

      const nullInstanceWrapper = {
        isDependencyTreeStatic: () => true,
        instance: null,
      } as unknown as InstanceWrapper;

      const nullProtoInstance = Object.create(null);
      const nullProtoWrapper = {
        isDependencyTreeStatic: () => true,
        instance: nullProtoInstance,
      } as unknown as InstanceWrapper;

      discoveryService.getProviders.mockReturnValue([
        nonStaticWrapper,
        nullInstanceWrapper,
        nullProtoWrapper,
      ]);

      // Act
      service.onModuleInit();

      // Assert
      expect(metadataScanner.getAllMethodNames).not.toHaveBeenCalled();
    });

    it('should return undefined when no handler is registered for eventType', () => {
      // Arrange & Act
      const handler = service.getHandler('non.existent.event');

      // Assert
      expect(handler).toBeUndefined();
    });
  });
});

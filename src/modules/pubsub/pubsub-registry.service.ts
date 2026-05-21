import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PUBSUB_LISTENER_KEY } from './pubsub.decorator';

@Injectable()
export class PubSubRegistryService extends BaseService implements OnModuleInit {
  private readonly registry = new Map<
    string,
    { target: unknown; method: (...args: unknown[]) => unknown }
  >();

  constructor(
    logger: LoggerService,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {
    super(logger);
  }

  onModuleInit() {
    this.explore();
  }

  private explore() {
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();

    const instanceWrappers = [...providers, ...controllers]
      .filter((wrapper) => wrapper.isDependencyTreeStatic())
      .filter((wrapper) => wrapper.instance);

    instanceWrappers.forEach((wrapper) => {
      const instance = wrapper.instance as Record<string, unknown>;

      // Ensure the instance prototype is valid for scanning
      const prototype = instance ? Object.getPrototypeOf(instance) : null;
      if (!prototype) {
        return;
      }

      const methodNames = this.metadataScanner.getAllMethodNames(prototype);
      for (const methodName of methodNames) {
        const methodRef = instance[methodName] as (
          ...args: unknown[]
        ) => unknown;
        if (!methodRef) continue;
        const eventType = this.reflector.get<string>(
          PUBSUB_LISTENER_KEY,
          methodRef,
        );

        if (eventType) {
          if (this.registry.has(eventType)) {
            this.logger.warn(
              `Duplicate @PubSubListener found for event type: ${eventType}. Overwriting existing handler.`,
            );
          }
          this.registry.set(eventType, { target: instance, method: methodRef });
          const className = instance.constructor
            ? (instance.constructor as Function).name
            : 'UnknownClass';
          this.logger.debug(
            `Registered PubSub Listener for event type '${eventType}' on ${className}.${methodName}`,
          );
        }
      }
    });
  }

  /**
   * Retrieves the registered handler for a specific event type.
   */
  getHandler(
    eventType: string,
  ): { target: unknown; method: (...args: unknown[]) => unknown } | undefined {
    return this.registry.get(eventType);
  }
}

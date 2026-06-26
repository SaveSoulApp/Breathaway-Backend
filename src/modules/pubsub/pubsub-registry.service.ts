import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PUBSUB_LISTENER_KEY } from './pubsub.decorator';

/**
 * Auto-discovers and maintains an in-memory registry of all methods decorated
 * with @PubSubListener across the application.
 *
 * Scans every registered NestJS provider and controller at module initialisation
 * using DiscoveryService and MetadataScanner. Each discovered handler is stored
 * keyed by its `eventType` string, enabling O(1) dispatch from the ingestion
 * controller. Duplicate registrations for the same event type emit a warning
 * and the last-registered handler wins.
 */
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

  /**
   * Triggers the full application scan after all modules have been initialised,
   * ensuring every @PubSubListener is registered before the first ingest request
   * can be handled.
   */
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
      const prototype = instance
        ? (Object.getPrototypeOf(instance) as object | null)
        : null;
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
            ? instance.constructor.name
            : 'UnknownClass';
          this.logger.debug(
            `Registered PubSub Listener for event type '${eventType}' on ${className}.${methodName}`,
          );
        }
      }
    });
  }

  /**
   * Looks up the handler registered for a specific Pub/Sub event type.
   *
   * Returns `undefined` when no @PubSubListener has been registered for the
   * given event type; the ingestion controller treats this as an unroutable
   * message and logs a warning.
   *
   * @param eventType - The event type string used as the registry key.
   * @returns The handler context containing the provider instance and the
   *   bound method reference, or `undefined` if not registered.
   */
  getHandler(
    eventType: string,
  ): { target: unknown; method: (...args: unknown[]) => unknown } | undefined {
    return this.registry.get(eventType);
  }
}

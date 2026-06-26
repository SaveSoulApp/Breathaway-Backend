import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PubSubIngestionController } from './pubsub-ingestion.controller';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubRegistryService } from './pubsub-registry.service';

/**
 * Provides the full GCP Pub/Sub integration layer — inbound message ingestion,
 * outbound event publishing, and auto-discovery of @PubSubListener handlers.
 *
 * Marked @Global so PubSubPublisherService is available application-wide without
 * re-importing this module in every feature module that needs to publish events.
 *
 * Imports:
 *   - DiscoveryModule: enables scanning all registered providers and controllers
 *     at startup to discover methods decorated with @PubSubListener.
 *
 * Exports:
 *   - PubSubPublisherService: exposes the publisher globally so any service can
 *     emit events to GCP Pub/Sub topics.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [PubSubIngestionController],
  providers: [PubSubRegistryService, PubSubPublisherService],
  exports: [PubSubPublisherService],
})
export class PubSubModule {}

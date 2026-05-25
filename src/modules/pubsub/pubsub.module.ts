import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PubSubIngestionController } from './pubsub-ingestion.controller';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubRegistryService } from './pubsub-registry.service';

@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [PubSubIngestionController],
  providers: [PubSubRegistryService, PubSubPublisherService],
  exports: [PubSubPublisherService],
})
export class PubSubModule {}

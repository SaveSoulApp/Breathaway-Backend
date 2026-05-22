import { Module } from '@nestjs/common';
import { PubSubModule } from '../pubsub/pubsub.module';
import { MetaMessagesService } from './meta-messages.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PubSubModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, MetaMessagesService],
})
export class WebhooksModule {}

import { Module } from '@nestjs/common';
import { MetaMessagesService } from './meta-messages.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, MetaMessagesService],
})
export class WebhooksModule { }

import { IdentityModule } from '@modules/identities/identities.module';
import { OtpModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { MetaMessagesService } from './meta-messages.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [OtpModule, SocialidentityModule, IdentityModule, PubSubModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, MetaMessagesService],
})
export class WebhooksModule {}

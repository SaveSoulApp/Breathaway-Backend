import { IdentityModule } from '@modules/identities/identities.module';
import { OtpModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { GenericMessageHandler } from './handlers/generic-message.handler';
import { OtpVerificationHandler } from './handlers/otp-verification.handler';
import { MetaMessagesService } from './meta-messages.service';
import { WEBHOOK_MESSAGE_HANDLERS } from './webhooks.constants';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [OtpModule, SocialidentityModule, IdentityModule, PubSubModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    MetaMessagesService,
    OtpVerificationHandler,
    GenericMessageHandler,
    {
      provide: WEBHOOK_MESSAGE_HANDLERS,
      useFactory: (
        otp: OtpVerificationHandler,
        generic: GenericMessageHandler,
      ) => [otp, generic],
      inject: [OtpVerificationHandler, GenericMessageHandler],
    },
  ],
})
export class WebhooksModule {}

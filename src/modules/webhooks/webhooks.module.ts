import { Module } from '@nestjs/common';
import { GenericMessageHandler } from './handlers/generic-message.handler';
import { OtpVerificationHandler } from './handlers/otp-verification.handler';
import { WEBHOOK_MESSAGE_HANDLERS } from './webhooks.constants';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
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

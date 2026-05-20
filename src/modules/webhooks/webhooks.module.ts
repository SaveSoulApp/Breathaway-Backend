import { Module } from '@nestjs/common';
import { IdentityModule } from '../identities/identities.module';
import { OtpModule } from '../one-time-passwords/one-time-passwords.module';
import { SocialidentityModule } from '../social-identities/social-identities.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [OtpModule, SocialidentityModule, IdentityModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule { }

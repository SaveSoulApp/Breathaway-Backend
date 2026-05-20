import { IdentityModule } from '@modules/identities/identities.module';
import { OtpModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [OtpModule, SocialidentityModule, IdentityModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

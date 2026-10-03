import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { PreferencesModule } from '@modules/preferences/preferences.module';

import { BrevoEmailAdapter } from './email/adapters/brevo.email.adapter';
import { EMAIL_ADAPTER_TOKEN } from './email/adapters/email-adapter.interface';
import { MailgunEmailAdapter } from './email/adapters/mailgun.email.adapter';
import { SendGridEmailAdapter } from './email/adapters/sendgrid.email.adapter';
import { EmailService } from './email/email.service';
import { NotificationEventsListener } from './listeners/notification-events.listener';
import { NotificationsAdminController } from './notifications-admin.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';
import { NotificationRecipientResolverService } from './recipient/notification-recipient-resolver.service';
import { LiteAppWhatsAppAdapter } from './whatsapp/adapters/liteapp.whatsapp.adapter';
import { WHATSAPP_ADAPTER_TOKEN } from './whatsapp/adapters/whatsapp-adapter.interface';

@Module({
  imports: [FirebaseModule, PreferencesModule, IdentityCryptoModule],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    NotificationsService,
    NotificationEventsListener,
    FcmProviderService,
    WhatsAppProviderService,
    // WhatsApp adapter concrete implementations
    LiteAppWhatsAppAdapter,
    // Factory provider: selects the active WhatsApp adapter at runtime
    {
      provide: WHATSAPP_ADAPTER_TOKEN,
      inject: [ConfigService, LiteAppWhatsAppAdapter],
      useFactory: (config: ConfigService, liteApp: LiteAppWhatsAppAdapter) => {
        const provider = config.get<string>('WHATSAPP_PROVIDER') ?? 'liteapp';
        if (provider === 'liteapp') return liteApp;
        return liteApp;
      },
    },
    // Optional Redis client for distributed deduplication
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) return null;
        return new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
      },
    },
    // Email adapter concrete implementations
    SendGridEmailAdapter,
    MailgunEmailAdapter,
    BrevoEmailAdapter,
    // Factory provider: selects the active adapter at runtime based on EMAIL_PROVIDER env
    {
      provide: EMAIL_ADAPTER_TOKEN,
      inject: [
        ConfigService,
        SendGridEmailAdapter,
        MailgunEmailAdapter,
        BrevoEmailAdapter,
      ],
      useFactory: (
        config: ConfigService,
        sendGrid: SendGridEmailAdapter,
        mailgun: MailgunEmailAdapter,
        brevo: BrevoEmailAdapter,
      ) => {
        const provider = config.get<string>('EMAIL_PROVIDER') ?? 'brevo';
        if (provider === 'brevo') return brevo;
        if (provider === 'sendgrid') return sendGrid;
        return mailgun;
      },
    },
    EmailService,
    NotificationRecipientResolverService,
  ],
  exports: [
    NotificationsService,
    EmailService,
    WhatsAppProviderService,
    NotificationRecipientResolverService,
  ],
})
export class NotificationsModule {}

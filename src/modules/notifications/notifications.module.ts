import { FirebaseModule } from '@modules/firebase/firebase.module';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoEmailAdapter } from './email/adapters/brevo.email.adapter';
import { EMAIL_ADAPTER_TOKEN } from './email/adapters/email-adapter.interface';
import { MailgunEmailAdapter } from './email/adapters/mailgun.email.adapter';
import { SendGridEmailAdapter } from './email/adapters/sendgrid.email.adapter';
import { EmailService } from './email/email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';

@Module({
  imports: [FirebaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FcmProviderService,
    WhatsAppProviderService,
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
        const provider = config.get<string>('EMAIL_PROVIDER') ?? 'mailgun';
        if (provider === 'brevo') return brevo;
        if (provider === 'sendgrid') return sendGrid;
        return mailgun;
      },
    },
    EmailService,
  ],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}

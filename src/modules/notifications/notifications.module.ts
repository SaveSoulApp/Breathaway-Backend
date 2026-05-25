import { FirebaseModule } from '@modules/firebase/firebase.module';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailProviderService } from './providers/email.provider.service';
import { FcmProviderService } from './providers/fcm.provider.service';
import { WhatsAppProviderService } from './providers/whatsapp.provider.service';

@Module({
  imports: [FirebaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FcmProviderService,
    EmailProviderService,
    WhatsAppProviderService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

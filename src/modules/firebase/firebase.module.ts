import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseService } from './firebase.service';

/**
 * Provides Firebase Admin SDK integration — token verification, user retrieval,
 * and FCM messaging — as a reusable capability across the application.
 *
 * Imports:
 *   - ConfigModule: supplies FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and
 *     FIREBASE_PRIVATE_KEY used to initialise the Admin SDK on module startup.
 *
 * Exports:
 *   - FirebaseService: shared with any module that needs to verify Firebase ID
 *     tokens (e.g., AuthModule) or dispatch FCM push notifications (e.g., NotificationsModule).
 */
@Module({
  imports: [ConfigModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}

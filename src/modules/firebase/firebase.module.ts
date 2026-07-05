import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

import { FirebaseService } from './firebase.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN_APP',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        if (admin.apps.length) {
          return admin.app();
        }

        const privateKey = configService
          .get<string>('FIREBASE_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n');

        return admin.initializeApp({
          credential: admin.credential.cert({
            projectId: configService.get('FIREBASE_PROJECT_ID'),
            clientEmail: configService.get('FIREBASE_CLIENT_EMAIL'),
            privateKey: privateKey,
          }),
        });
      },
    },
    FirebaseService,
  ],
  exports: [FirebaseService, 'FIREBASE_ADMIN_APP'],
})
export class FirebaseModule {}

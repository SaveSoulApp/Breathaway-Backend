import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { BaseService } from '@core/base/base.service';
import { LoggerService } from '@core/logger/logger.service';
import {
  AuthMethodInfo,
  getAuthMethodFromDecodedToken,
} from '@modules/auth/utils/auth-method.utils';

export interface FirebaseValidationResult {
  decodedToken: admin.auth.DecodedIdToken;
  authMethod: AuthMethodInfo;
}

@Injectable()
export class FirebaseService extends BaseService implements OnModuleInit {
  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);
  }

  onModuleInit() {
    try {
      if (!admin.apps.length) {
        this.initializeFirebase();
      }
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error);
    }
  }

  private initializeFirebase() {
    const privateKey = this.configService
      .get('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.configService.get('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get('FIREBASE_CLIENT_EMAIL'),
        privateKey: privateKey,
      }),
    });
  }

  getMessaging() {
    return admin.messaging();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    try {
      return await admin.auth().getUser(uid);
    } catch (error) {
      throw new UnauthorizedException('Firebase user not found');
    }
  }

  /**
   * Common function to validate Firebase token and UID
   * Returns both the decoded token and authentication method information
   * Throws UnauthorizedException if validation fails
   */
  async validateFirebaseToken(
    uid: string,
    idToken: string,
    context?: string,
  ): Promise<FirebaseValidationResult> {
    const contextInfo = context ? ` [${context}]` : '';

    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      // Verify that the UID matches the token
      if (decodedToken.uid !== uid) {
        throw new UnauthorizedException(
          `UID does not match token${contextInfo}`,
        );
      }

      // Get authentication method information
      const authMethod = getAuthMethodFromDecodedToken(decodedToken);

      return {
        decodedToken,
        authMethod,
      };
    } catch (error) {
      // Log the error for debugging
      console.error(`Firebase validation failed${contextInfo}:`, error);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Handle Firebase Admin SDK errors
      if (error?.errorInfo?.code) {
        const errorCode = error.errorInfo.code;
        switch (errorCode) {
          case 'auth/id-token-expired':
            throw new UnauthorizedException(
              `Firebase ID token has expired${contextInfo}`,
            );
          case 'auth/id-token-revoked':
            throw new UnauthorizedException(
              `Firebase ID token has been revoked${contextInfo}`,
            );
          case 'auth/argument-error':
            throw new UnauthorizedException(
              `Invalid Firebase ID token format${contextInfo}`,
            );
          case 'auth/invalid-id-token':
            throw new UnauthorizedException(
              `Invalid Firebase ID token${contextInfo}`,
            );
          default:
            throw new UnauthorizedException(
              `Firebase authentication failed: ${errorCode}${contextInfo}`,
            );
        }
      }

      throw new UnauthorizedException(
        `Invalid Firebase authentication${contextInfo}`,
      );
    }
  }
}

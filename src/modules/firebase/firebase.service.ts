import {
  Inject,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  AuthMethodInfo,
  getAuthMethodFromDecodedToken,
} from '@modules/auth/utils/auth-method.utils';

/**
 * Structured result returned by `validateFirebaseToken`, bundling the raw
 * decoded JWT with the resolved authentication method for downstream use.
 */
export interface FirebaseValidationResult {
  /** The decoded Firebase ID token payload including uid, email, and sign-in provider claims. */
  decodedToken: admin.auth.DecodedIdToken;
  /** The authentication method (e.g., Google, Apple, email) derived from the token's sign-in provider. */
  authMethod: AuthMethodInfo;
}

/**
 * Wraps the Firebase Admin SDK to provide token verification, user lookup,
 * and FCM messaging access to the rest of the application.
 *
 * The Admin SDK app instance is injected via dependency injection to facilitate
 * cleaner testing and decouple from the global package singleton state.
 */
@Injectable()
export class FirebaseService extends BaseService implements OnModuleDestroy {
  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    @Inject('FIREBASE_ADMIN_APP')
    private readonly firebaseApp: admin.app.App,
  ) {
    super(loggerService);
  }

  async onModuleDestroy() {
    this.logger.log('Cleaning up Firebase Admin SDK app', { step: 'destroy' });
    try {
      await this.firebaseApp.delete();
    } catch (error) {
      this.logger.error('Failed to delete Firebase app', {
        appName: this.firebaseApp.name,
        step: 'destroy',
        err: serializeError(error),
      });
    }
  }

  /**
   * Returns the Firebase Cloud Messaging instance for dispatching push notifications.
   *
   * Delegates directly to the Admin SDK app instance.
   *
   * @returns The FCM Messaging instance used to send messages to device tokens or topics.
   */
  getMessaging() {
    return this.firebaseApp.messaging();
  }

  /**
   * Verifies a Firebase ID token and returns its decoded payload.
   *
   * Use `validateFirebaseToken` instead when a UID consistency check is also
   * required. This method is suitable for lightweight read-only token inspection.
   *
   * @param idToken - The Firebase ID token from the client's Authorization header.
   * @returns The decoded token payload including uid, email, and provider claims.
   * @throws {UnauthorizedException} When the token is invalid, expired, or revoked.
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await this.firebaseApp.auth().verifyIdToken(idToken);
    } catch (error) {
      this.logger.error('Firebase ID token verification failed', {
        step: 'verify_token',
        err: serializeError(error),
      });
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  /**
   * Fetches the Firebase UserRecord for the given UID.
   *
   * Primarily used to inspect a user's provider data, disabled status, or
   * custom claims without requiring a fresh ID token from the client.
   *
   * @param uid - The Firebase UID of the user to retrieve.
   * @returns The UserRecord containing account metadata and provider details.
   * @throws {UnauthorizedException} When no Firebase user exists with the given UID.
   */
  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    try {
      return await this.firebaseApp.auth().getUser(uid);
    } catch (error) {
      this.logger.error('Failed to fetch Firebase user', {
        uid,
        step: 'get_user',
        err: serializeError(error),
      });
      throw new UnauthorizedException('Firebase user not found');
    }
  }

  /**
   * Verifies a Firebase ID token and asserts that its `uid` claim matches the
   * supplied UID, preventing token-substitution attacks.
   *
   * Resolves the authentication method (Google, Apple, email/password, etc.) from
   * the decoded token and returns it alongside the raw payload for downstream use.
   * Specific Firebase Admin SDK error codes are mapped to descriptive
   * `UnauthorizedException` messages to aid client-side debugging.
   *
   * @param uid     - The UID claimed by the caller; must match the token's `uid` claim.
   * @param idToken - The Firebase ID token to verify.
   * @param context - Optional label (e.g., route name) appended to error messages for tracing.
   * @returns The decoded token and resolved auth method on successful validation.
   * @throws {UnauthorizedException} When the token is invalid, expired, revoked, malformed,
   *   or when the `uid` does not match the token's subject.
   */
  async validateFirebaseToken(
    uid: string,
    idToken: string,
    context?: string,
  ): Promise<FirebaseValidationResult> {
    const contextInfo = context ? ` [${context}]` : '';
    const ctx = { uid, context };

    try {
      this.logger.debug('Validating Firebase ID token', {
        ...ctx,
        step: 'validate',
      });

      // Verify the Firebase ID token
      const decodedToken = await this.firebaseApp.auth().verifyIdToken(idToken);

      // Verify that the UID matches the token
      if (decodedToken.uid !== uid) {
        this.logger.warn('Firebase validation failed: UID mismatch', {
          ...ctx,
          actualUid: decodedToken.uid,
          step: 'validate',
        });
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
      this.logger.error('Firebase validation failed', {
        ...ctx,
        step: 'validate',
        err: serializeError(error),
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Handle Firebase Admin SDK errors
      const err = error as { errorInfo?: { code?: string } };
      if (err?.errorInfo?.code) {
        const errorCode = err.errorInfo.code;
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

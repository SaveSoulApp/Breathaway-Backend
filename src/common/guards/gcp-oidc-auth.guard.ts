import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

import { serializeError } from '@common/utils/error.utils';
import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Authenticates service-to-service requests within GCP using OpenID Connect (OIDC) tokens.
 *
 * Validates Google-signed Bearer tokens to secure endpoints meant to be invoked
 * by internal GCP services like Cloud Scheduler or Cloud Pub/Sub.
 *
 * Enforces strict cryptographic and identity checks to prevent "confused deputy" attacks:
 * 1. Cryptographic signature verified against Google's public JWKS.
 * 2. Issuer claim (`iss`) strictly verified against `accounts.google.com`.
 * 3. Audience claim (`aud`) verified against configured `GCP_OIDC_AUDIENCE`.
 * 4. Caller identity (`email`) verified to belong to the authorized GCP project or explicit whitelist.
 */
@Injectable()
export class GcpOidcAuthGuard implements CanActivate {
  private readonly oAuth2Client = new OAuth2Client();
  private readonly logger: ContextualLogger;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.logger = loggerService.forContext(GcpOidcAuthGuard.name);
  }

  /**
   * Verifies the OIDC token from the Authorization header using Google's public JWKS.
   *
   * Ensures the token is signed by Google, intended for this specific service
   * audience, and issued to an authorized service account.
   *
   * @returns `true` if the OIDC token is valid and matches the configured audience and project.
   * @throws {UnauthorizedException} When the token is missing, invalid, or caller is unauthorized.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or invalid Authorization header format', {
        step: 'authenticate',
      });
      throw new UnauthorizedException('Invalid or missing Bearer token');
    }

    const token = authHeader.split(' ')[1];

    // GCP_OIDC_AUDIENCE should be configured in your environment (e.g. Cloud Run URL).
    const audience = this.configService.get<string>('GCP_OIDC_AUDIENCE');

    if (!audience) {
      this.logger.error('GCP_OIDC_AUDIENCE environment variable is not set', {
        step: 'authenticate',
      });
      throw new UnauthorizedException('Server configuration error');
    }

    try {
      // 1. Fetch and cache Google's public JWKS to verify token signature and expiry
      const loginTicket = await this.oAuth2Client.verifyIdToken({
        idToken: token,
        audience,
      });

      const payload = loginTicket.getPayload();

      if (!payload) {
        throw new Error('No payload returned from verifyIdToken');
      }

      // 2. Strictly verify the issuer is Google accounts
      if (
        payload.iss !== 'https://accounts.google.com' &&
        payload.iss !== 'accounts.google.com'
      ) {
        throw new Error(
          `Invalid issuer: expected accounts.google.com, received ${payload.iss}`,
        );
      }

      // 3. Explicitly verify audience claim matches expected service URL (prevents cross-service replay)
      if (payload.aud !== audience) {
        throw new Error(
          `Invalid audience: expected ${audience}, received ${payload.aud}`,
        );
      }

      // 4. Verify email claim is present and verified by Google
      if (!payload.email_verified) {
        throw new Error('OIDC token email is not verified by Google');
      }

      if (!payload.email) {
        throw new Error('Missing email claim in OIDC token payload');
      }

      // 5. Prevent Confused Deputy attacks: ensure caller service account belongs to our project/whitelist
      const allowedEmailsConfig = this.configService.get<string>(
        'GCP_OIDC_ALLOWED_EMAILS',
      );
      const expectedProjectId =
        this.configService.get<string>('GCP_PROJECT_ID');

      if (allowedEmailsConfig) {
        const allowedEmails = allowedEmailsConfig
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean);

        if (!allowedEmails.includes(payload.email.toLowerCase())) {
          throw new Error(
            `Unauthorized service account: ${payload.email}. Not in configured whitelist.`,
          );
        }
      } else if (expectedProjectId) {
        const expectedDomain =
          `@${expectedProjectId}.iam.gserviceaccount.com`.toLowerCase();
        if (!payload.email.toLowerCase().endsWith(expectedDomain)) {
          throw new Error(
            `Confused deputy rejected: service account ${payload.email} does not belong to project ${expectedProjectId}`,
          );
        }
      }

      // Attach the payload to the request for downstream audit logging if needed
      (request as Request & { oidcPayload?: TokenPayload }).oidcPayload =
        payload;

      return true;
    } catch (error: unknown) {
      this.logger.error('OIDC verification failed', {
        step: 'authenticate',
        err: serializeError(error),
      });
      throw new UnauthorizedException('Invalid OIDC token');
    }
  }
}

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
import { LoggerService } from '@core/logger';

/**
 * Authenticates service-to-service requests within GCP using OpenID Connect (OIDC) tokens.
 *
 * Validates Google-signed Bearer tokens to secure endpoints meant to be invoked
 * by internal GCP services like Cloud Scheduler or Cloud Tasks.
 */
@Injectable()
export class GcpOidcAuthGuard implements CanActivate {
  private readonly oAuth2Client = new OAuth2Client();
  private readonly logger;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.logger = loggerService.forContext(GcpOidcAuthGuard.name);
  }

  /**
   * Verifies the OIDC token from the Authorization header using Google's public JWKS.
   *
   * Ensures the token is signed by Google and intended for this specific service
   * audience. Attaches the decoded payload to the request for downstream use.
   *
   * @returns `true` if the OIDC token is valid and matches the configured audience.
   * @throws {UnauthorizedException} When the token is missing, invalid, or the server is misconfigured.
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

    // GCP_OIDC_AUDIENCE should be configured in your environment.
    // e.g., the URL of this service or a custom string you set up in the Cloud Scheduler job.
    const audience = this.configService.get<string>('GCP_OIDC_AUDIENCE');

    if (!audience) {
      this.logger.error('GCP_OIDC_AUDIENCE environment variable is not set', {
        step: 'authenticate',
      });
      throw new UnauthorizedException('Server configuration error');
    }

    try {
      // This automatically fetches and caches Google's public JWKS to verify the token signature
      const loginTicket = await this.oAuth2Client.verifyIdToken({
        idToken: token,
        audience,
      });

      const payload = loginTicket.getPayload();

      if (!payload) {
        throw new Error('No payload returned from verifyIdToken');
      }

      // Optionally verify the issuer is exactly Google accounts
      if (
        payload.iss !== 'https://accounts.google.com' &&
        payload.iss !== 'accounts.google.com'
      ) {
        throw new Error(`Invalid issuer: ${payload.iss}`);
      }

      // Attach the payload to the request if needed by controllers later
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

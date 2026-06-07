import { LoggerService } from '@core/logger';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class GcpOidcAuthGuard implements CanActivate {
  private readonly oAuth2Client = new OAuth2Client();

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        'Missing or invalid Authorization header format',
        GcpOidcAuthGuard.name,
      );
      throw new UnauthorizedException('Invalid or missing Bearer token');
    }

    const token = authHeader.split(' ')[1];

    // GCP_OIDC_AUDIENCE should be configured in your environment.
    // e.g., the URL of this service or a custom string you set up in the Cloud Scheduler job.
    const audience = this.configService.get<string>('GCP_OIDC_AUDIENCE');

    if (!audience) {
      this.logger.error(
        'GCP_OIDC_AUDIENCE environment variable is not set',
        GcpOidcAuthGuard.name,
      );
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OIDC verification failed: ${errorMessage}`,
        GcpOidcAuthGuard.name,
      );
      throw new UnauthorizedException('Invalid OIDC token');
    }
  }
}

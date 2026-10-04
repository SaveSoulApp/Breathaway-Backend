import { createHash } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { GoogleAuth, OAuth2Client, TokenPayload } from 'google-auth-library';
import { ClsService } from 'nestjs-cls';

import { serializeError } from '@common/utils/error.utils';
import { ContextualLogger, LoggerService } from '@core/logger';

export interface AdminUserIdentity {
  email: string;
  sub: string;
  emailHash: string;
}

/**
 * Protects administrative routes using Google OpenID Connect (OIDC) ID tokens.
 *
 * Verifies that incoming Bearer tokens are valid, signed by Google Accounts,
 * and issued to an authorized GCP project administrator (verified dynamically
 * via GCP Cloud Resource Manager IAM policy or configured admin whitelist).
 */
@Injectable()
export class AdminOidcAuthGuard implements CanActivate {
  private readonly oAuth2Client = new OAuth2Client();
  private readonly googleAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  private readonly logger: ContextualLogger;

  /** In-memory cache for authorized GCP IAM admin emails to prevent repeated API calls. */
  private cachedIamAdminEmails: Set<string> | null = null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /** Active in-flight promise for GCP IAM policy fetch to prevent concurrent stampedes. */
  private inFlightIamFetch: Promise<Set<string>> | null = null;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly clsService: ClsService,
  ) {
    this.logger = loggerService.forContext(AdminOidcAuthGuard.name);
  }

  /**
   * Validates the Google OIDC ID token and verifies caller's IAM authorization.
   *
   * @throws {UnauthorizedException} When token is missing, expired, or invalid.
   * @throws {ForbiddenException} When authenticated user is not an authorized GCP admin.
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

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      this.logger.warn('Empty Bearer token provided', {
        step: 'authenticate',
      });
      throw new UnauthorizedException('Invalid or missing Bearer token');
    }

    // Canonical Google Cloud SDK OAuth client ID used by `gcloud auth print-identity-token`
    const GCLOUD_CLI_CLIENT_ID = '32555940559.apps.googleusercontent.com';

    const audienceConfig =
      this.configService.get<string>('GCP_ADMIN_OIDC_AUDIENCE') ||
      this.configService.get<string>('GCP_OIDC_AUDIENCE');

    const configuredAudiences = audienceConfig
      ? audienceConfig
          .split(',')
          .map((aud) => aud.trim())
          .filter(Boolean)
      : [];

    const allowedAudiences = Array.from(
      new Set([...configuredAudiences, GCLOUD_CLI_CLIENT_ID]),
    );

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.oAuth2Client.verifyIdToken({
        idToken: token,
        audience: allowedAudiences,
      });
      payload = ticket.getPayload();
    } catch (error: unknown) {
      this.logger.warn('Google OIDC verification failed', {
        step: 'authenticate',
        err: serializeError(error),
      });
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload) {
      throw new UnauthorizedException('Missing token payload');
    }

    // Verify token issuer is Google
    if (
      payload.iss !== 'https://accounts.google.com' &&
      payload.iss !== 'accounts.google.com'
    ) {
      this.logger.warn('Invalid token issuer', {
        step: 'authenticate',
        issuer: payload.iss,
      });
      throw new UnauthorizedException('Invalid token issuer');
    }

    // Verify email claim
    if (!payload.email || !payload.email_verified) {
      this.logger.warn('Token email is unverified or missing', {
        step: 'authenticate',
        email: payload.email,
      });
      throw new UnauthorizedException('Google account email is not verified');
    }

    const email = payload.email.toLowerCase();
    const isAuthorized = await this.isAuthorizedAdmin(email);

    if (!isAuthorized) {
      this.logger.warn(
        'Forbidden: Caller is not an authorized GCP administrator',
        {
          step: 'authorize',
          adminEmail: email,
          route: request.originalUrl,
          method: request.method,
        },
      );
      throw new ForbiddenException(
        'Forbidden: Caller does not have administrative permissions in GCP',
      );
    }

    const emailHash = createHash('sha256').update(email).digest('hex');

    // Attach identity to CLS and Request for downstream services and audit loggers
    this.clsService.set('adminEmail', email);
    this.clsService.set('adminSub', payload.sub);
    this.clsService.set('adminEmailHash', emailHash);

    (request as Request & { adminUser?: AdminUserIdentity }).adminUser = {
      email,
      sub: payload.sub,
      emailHash,
    };

    this.logger.info('Admin successfully authenticated and authorized', {
      step: 'authenticate',
      adminEmail: email,
      adminSub: payload.sub,
      route: request.originalUrl,
      method: request.method,
    });

    return true;
  }

  /**
   * Checks whether the given email has administrative authorization.
   */
  private async isAuthorizedAdmin(email: string): Promise<boolean> {
    // 1. Check explicit environment/config whitelist (useful for testing or explicit overrides)
    const allowedEmailsConfig = this.configService.get<string>(
      'ADMIN_ALLOWED_EMAILS',
    );
    if (allowedEmailsConfig) {
      const allowedEmails = allowedEmailsConfig
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (allowedEmails.includes(email)) {
        return true;
      }
    }

    // 2. Check cached GCP IAM policy
    if (this.cachedIamAdminEmails && Date.now() < this.cacheExpiresAt) {
      return this.cachedIamAdminEmails.has(email);
    }

    // 3. Query GCP Cloud Resource Manager IAM policy (deduplicating concurrent in-flight requests)
    if (!this.inFlightIamFetch) {
      this.inFlightIamFetch = this.fetchGcpIamAdminEmails()
        .then((emails) => {
          this.cachedIamAdminEmails = emails;
          this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
          return emails;
        })
        .finally(() => {
          this.inFlightIamFetch = null;
        });
    }

    try {
      const iamAdminEmails = await this.inFlightIamFetch;
      const isAuthorized = iamAdminEmails.has(email);
      if (!isAuthorized) {
        this.logger.warn(
          'Caller email was not found among GCP IAM project admin members',
          {
            step: 'authorize_iam',
            adminEmail: email,
            discoveredAdminCount: iamAdminEmails.size,
          },
        );
      }
      return isAuthorized;
    } catch (error: unknown) {
      this.logger.warn('Failed to query GCP IAM policy for project', {
        step: 'fetch_iam_policy',
        adminEmail: email,
        err: serializeError(error),
      });
      return false;
    }
  }

  /**
   * Queries the GCP Cloud Resource Manager API to discover project administrators.
   */
  private async fetchGcpIamAdminEmails(): Promise<Set<string>> {
    const projectId =
      this.configService.get<string>('GCP_PROJECT_ID') ||
      (await this.googleAuth.getProjectId());

    if (!projectId) {
      throw new Error('GCP_PROJECT_ID is not configured');
    }

    const client = await this.googleAuth.getClient();
    const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`;

    const response = await client.request<{
      bindings?: Array<{ role: string; members?: string[] }>;
    }>({
      url,
      method: 'POST',
      data: {},
    });

    const bindings = response.data?.bindings || [];

    const configuredRoles = this.configService.get<string>(
      'GCP_ADMIN_IAM_ROLES',
    );
    const adminRoles = configuredRoles
      ? configuredRoles
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : [
          'roles/owner',
          'roles/editor',
          'roles/resourcemanager.organizationAdmin',
        ];

    const authorizedEmails = new Set<string>();

    for (const binding of bindings) {
      if (adminRoles.includes(binding.role) && binding.members) {
        for (const member of binding.members) {
          if (member.startsWith('user:')) {
            authorizedEmails.add(
              member.slice('user:'.length).trim().toLowerCase(),
            );
          } else if (member.startsWith('serviceAccount:')) {
            authorizedEmails.add(
              member.slice('serviceAccount:'.length).trim().toLowerCase(),
            );
          }
        }
      }
    }

    return authorizedEmails;
  }

  /**
   * Clears the in-memory IAM cache and pending in-flight promise. Useful for unit testing.
   */
  clearIamCache(): void {
    this.cachedIamAdminEmails = null;
    this.cacheExpiresAt = 0;
    this.inFlightIamFetch = null;
  }
}

import { createHash } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { GoogleAuth, OAuth2Client, TokenPayload } from 'google-auth-library';
import { ClsService } from 'nestjs-cls';

import { serializeError } from '@common/utils/error.utils';
import { ContextualLogger, LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';

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
 * via GCP Cloud Resource Manager IAM policy).
 */
@Injectable()
export class AdminOidcAuthGuard implements CanActivate {
  private readonly oAuth2Client = new OAuth2Client();
  private readonly googleAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  private readonly logger: ContextualLogger;

  /** Base TTL for authorized GCP IAM admin emails in Redis (5 minutes). */
  private readonly BASE_CACHE_TTL_SECONDS = 300;

  /** Jitter range (±30 seconds) to prevent synchronized cross-instance stampedes. */
  private readonly CACHE_JITTER_SECONDS = 30;

  /** In-memory fallback TTL in milliseconds when Redis is unconfigured or unavailable (5 minutes). */
  private readonly FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;

  /** In-memory cache for authorized GCP IAM admin emails used as degraded fallback. */
  private cachedIamAdminEmails: Set<string> | null = null;
  private cacheExpiresAt = 0;

  /** Active in-flight promise for GCP IAM policy fetch to prevent concurrent stampedes per instance. */
  private inFlightIamFetch: Promise<Set<string>> | null = null;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly clsService: ClsService,
    @Optional() private readonly redisService?: RedisService,
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
   * Resolves the GCP project ID from configuration or Google application credentials.
   */
  private async getProjectId(): Promise<string> {
    const projectId =
      this.configService.get<string>('GCP_PROJECT_ID') ||
      (await this.googleAuth.getProjectId());

    if (!projectId) {
      throw new Error('GCP_PROJECT_ID is not configured');
    }

    return projectId;
  }

  /**
   * Constructs the distributed Redis cache key for authorized GCP IAM admin emails.
   */
  private buildCacheKey(projectId: string): string {
    return `admin:iam:authorized_emails:${projectId}`;
  }

  /**
   * Computes a jittered TTL (300 ± 30 seconds) to prevent synchronized
   * cache expiration stampedes across horizontally autoscaled Cloud Run instances.
   */
  private calculateJitteredTtl(): number {
    const min = this.BASE_CACHE_TTL_SECONDS - this.CACHE_JITTER_SECONDS;
    const max = this.BASE_CACHE_TTL_SECONDS + this.CACHE_JITTER_SECONDS;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Checks whether the given email has administrative authorization via GCP IAM.
   *
   * Utilizes a multi-tier caching strategy:
   * 1. Distributed Redis cache (with jittered TTL to prevent cross-instance stampedes).
   * 2. Process-local in-memory cache as a degraded fallback when Redis is unconfigured or unavailable.
   * 3. Singleflight promise deduplication for concurrent in-flight requests on the same instance.
   */
  private async isAuthorizedAdmin(email: string): Promise<boolean> {
    try {
      const projectId = await this.getProjectId();
      const cacheKey = this.buildCacheKey(projectId);

      // 1. Check shared Redis cache (authoritative distributed store)
      if (this.redisService?.isConfigured) {
        try {
          const cached = await this.redisService.get(cacheKey);
          if (cached) {
            const parsed: unknown = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              const adminEmails = new Set<string>(
                parsed.filter(
                  (item): item is string => typeof item === 'string',
                ),
              );
              return this.evaluateAuthorization(email, adminEmails);
            }
          }
        } catch (error: unknown) {
          this.logger.warn(
            'Failed to read GCP IAM admin emails from Redis; falling back to in-memory cache',
            {
              step: 'read_redis_iam_cache',
              err: serializeError(error),
            },
          );
          // Fall back to in-memory cache if available during Redis degradation
          if (this.cachedIamAdminEmails && Date.now() < this.cacheExpiresAt) {
            return this.evaluateAuthorization(email, this.cachedIamAdminEmails);
          }
        }
      } else {
        // 2. Check in-memory cache fallback when Redis is unconfigured
        if (this.cachedIamAdminEmails && Date.now() < this.cacheExpiresAt) {
          return this.evaluateAuthorization(email, this.cachedIamAdminEmails);
        }
      }

      // 3. Fetch from GCP IAM policy (deduplicating concurrent in-flight requests on this instance)
      if (!this.inFlightIamFetch) {
        this.inFlightIamFetch = this.fetchAndCacheIamAdminEmails(
          projectId,
          cacheKey,
        ).finally(() => {
          this.inFlightIamFetch = null;
        });
      }

      const adminEmails = await this.inFlightIamFetch;
      return this.evaluateAuthorization(email, adminEmails);
    } catch (error: unknown) {
      this.logger.error('Failed to query GCP IAM policy for project', {
        step: 'fetch_iam_policy',
        adminEmail: email,
        err: serializeError(error),
      });
      return false;
    }
  }

  /**
   * Evaluates if caller email is present in authorized emails and logs security telemetry.
   */
  private evaluateAuthorization(
    email: string,
    adminEmails: Set<string>,
  ): boolean {
    const isAuthorized = adminEmails.has(email);
    if (!isAuthorized) {
      this.logger.warn(
        'Caller email was not found among GCP IAM project admin members',
        {
          step: 'authorize_iam',
          adminEmail: email,
          discoveredAdminCount: adminEmails.size,
        },
      );
    }
    return isAuthorized;
  }

  /**
   * Fetches the GCP IAM policy, populates local memory and distributed Redis with jittered TTL.
   */
  private async fetchAndCacheIamAdminEmails(
    projectId: string,
    cacheKey: string,
  ): Promise<Set<string>> {
    const adminEmails = await this.fetchGcpIamAdminEmails(projectId);

    // Update in-memory fallback
    this.cachedIamAdminEmails = adminEmails;
    this.cacheExpiresAt = Date.now() + this.FALLBACK_CACHE_TTL_MS;

    // Populate Redis with jittered TTL (300 ± 30s)
    if (this.redisService?.isConfigured) {
      const ttlSeconds = this.calculateJitteredTtl();
      try {
        await this.redisService.set(
          cacheKey,
          JSON.stringify(Array.from(adminEmails)),
          { ttlSeconds },
        );
        this.logger.debug('Populated GCP IAM admin emails in Redis cache', {
          step: 'cache_iam_redis',
          adminCount: adminEmails.size,
          ttlSeconds,
        });
      } catch (error: unknown) {
        this.logger.warn(
          'Failed to write GCP IAM admin emails to Redis cache',
          {
            step: 'write_redis_iam_cache',
            err: serializeError(error),
          },
        );
      }
    }

    return adminEmails;
  }

  /**
   * Queries the GCP Cloud Resource Manager API to discover project administrators.
   */
  private async fetchGcpIamAdminEmails(
    projectId: string,
  ): Promise<Set<string>> {
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
   * Clears the in-memory and Redis IAM cache and pending in-flight promise.
   * Useful for testing and immediate invalidation.
   */
  async clearIamCache(): Promise<void> {
    this.cachedIamAdminEmails = null;
    this.cacheExpiresAt = 0;
    this.inFlightIamFetch = null;

    if (this.redisService?.isConfigured) {
      try {
        const projectId = await this.getProjectId();
        await this.redisService.del(this.buildCacheKey(projectId));
      } catch (error: unknown) {
        this.logger.warn('Failed to clear IAM cache in Redis', {
          step: 'clear_iam_redis',
          err: serializeError(error),
        });
      }
    }
  }
}

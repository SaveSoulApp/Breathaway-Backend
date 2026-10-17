import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { ContextualLogger, LOG_EVENT, LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

import {
  AUTH_REVOKED_TOKEN_PREFIX,
  AUTH_USER_ACTIVE_PREFIX,
  DEFAULT_JWT_CACHE_TTL_SECONDS,
  REVOKED_TOKEN_TTL_SECONDS,
} from '../constants';

/**
 * High-performance, short-TTL cache service for active user JWT status in Redis.
 *
 * Caches positive user authorization status to reduce Cloud SQL connection pool pressure
 * and achieve sub-millisecond JWT authentication latency. Supports immediate revocation
 * upon destructive events (account deletion, soft deletion, admin blocking, and signout)
 * with graceful database fallback when Redis is unconfigured or disabled via feature flag.
 *
 * TTL Alignment & Active Session Window:
 * - JWT_CACHE_TTL_SECONDS (default: 300s / 5 minutes) defines the sliding active-session window
 *   during which positive status is served directly from Redis memory without querying PostgreSQL.
 * - Even though JWT_EXPIRES_IN is 15 minutes (900s), a 5-minute cache TTL deliberately bounds
 *   the window for detecting out-of-band administrative actions (such as direct DB edits or manual
 *   deactivations) to at most 5 minutes.
 * - Active users make at most 3 database verification checks across their token's entire 15-minute
 *   lifetime (saving >96% of repetitive queries). Operators wishing to eliminate all intermediate
 *   lookups can set JWT_CACHE_TTL_SECONDS=900 to match JWT_EXPIRES_IN exactly.
 */
@Injectable()
export class JwtAuthCacheService {
  private readonly logger: ContextualLogger;
  private readonly cacheEnabled: boolean;
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {
    this.logger = loggerService.forContext(JwtAuthCacheService.name);

    const rawEnabled = this.configService.get<boolean | string>(
      'JWT_CACHE_ENABLED',
      true,
    );
    this.cacheEnabled =
      typeof rawEnabled === 'boolean' ? rawEnabled : rawEnabled !== 'false';

    const rawTtl = Number(
      this.configService.get<number>(
        'JWT_CACHE_TTL_SECONDS',
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      ),
    );
    this.ttlSeconds =
      Number.isFinite(rawTtl) && rawTtl > 0
        ? rawTtl
        : DEFAULT_JWT_CACHE_TTL_SECONDS;
  }

  /**
   * Indicates whether the Redis active status cache is enabled and operational.
   */
  get isEnabled(): boolean {
    return this.cacheEnabled && (this.redisService?.isConfigured ?? false);
  }

  /**
   * Constructs the Redis set key for an active user session.
   * Key shape: user:active:<userId>
   *
   * @param userId - The user UUID.
   * @returns Formatted Redis key string.
   */
  getCacheKey(userId: string): string {
    return `${AUTH_USER_ACTIVE_PREFIX}${userId}`;
  }

  /**
   * Checks whether the user's active status is cached in Redis using O(1) set membership.
   *
   * @param userId - The user UUID.
   * @param jti - Optional JWT ID claim.
   * @returns True on cache hit, false on cache miss or when Redis is disabled/unavailable.
   */
  async isUserActive(userId: string, jti?: string): Promise<boolean> {
    if (!this.isEnabled || !this.redisService) {
      this.logger.event?.(LOG_EVENT.AUTH_CACHE_FALLBACK, {
        step: 'auth_cache_fallback',
        userId,
        jti,
        reason: !this.cacheEnabled ? 'cache_disabled' : 'redis_unconfigured',
      });
      return false;
    }

    try {
      const key = this.getCacheKey(userId);
      const member = jti ?? userId;
      const isMember = await this.redisService.sismember(key, member);

      if (isMember) {
        this.logger.event?.(LOG_EVENT.AUTH_CACHE_HIT, {
          step: 'auth_cache_hit',
          userId,
          jti,
        });
        return true;
      }

      this.logger.event?.(LOG_EVENT.AUTH_CACHE_MISS, {
        step: 'auth_cache_miss',
        userId,
        jti,
      });
      return false;
    } catch (err) {
      this.logger.event?.(LOG_EVENT.AUTH_CACHE_FALLBACK, {
        step: 'auth_cache_fallback',
        userId,
        jti,
        reason: 'redis_error',
        error: err instanceof Error ? err.message : String(err),
      });
      this.logger.warn(
        'Failed to query user active cache in Redis, falling back to database',
        {
          step: 'jwt_cache_check_fallback',
          userId,
          jti,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return false;
    }
  }

  /**
   * Caches the user's active status in Redis by adding the token identifier to the user's set with TTL.
   * Uses an atomic Redis pipeline to guarantee that key addition and TTL setting happen simultaneously.
   * Appends to existing active sessions (multi-device support) without overwriting.
   *
   * @param userId - The user UUID.
   * @param jti - Optional JWT ID claim.
   */
  async setUserActive(userId: string, jti?: string): Promise<void> {
    if (!this.isEnabled || !this.redisService) {
      return;
    }

    try {
      const key = this.getCacheKey(userId);
      const member = jti ?? userId;
      await this.redisService.saddWithExpire(key, member, this.ttlSeconds);
    } catch (err) {
      this.logger.warn('Failed to cache user active status in Redis', {
        step: 'jwt_cache_set_failed',
        userId,
        jti,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Checks whether a specific access token JTI has been explicitly revoked / blacklisted.
   *
   * @param jti - The unique JWT ID claim.
   * @returns True if the token was explicitly revoked, false otherwise.
   */
  async isTokenRevoked(jti?: string): Promise<boolean> {
    if (!jti || !this.isEnabled || !this.redisService) {
      return false;
    }

    try {
      const val = await this.redisService.get(
        `${AUTH_REVOKED_TOKEN_PREFIX}${jti}`,
      );
      const isRevoked = val === '1';
      if (isRevoked) {
        this.logger.event?.(LOG_EVENT.AUTH_CACHE_REVOCATION_BLOCKED, {
          step: 'auth_cache_revocation_blocked',
          jti,
        });
      }
      return isRevoked;
    } catch (err) {
      this.logger.warn(
        'Failed to query revoked token status in Redis, defaulting to unrevoked',
        {
          step: 'jwt_cache_revoked_check_failed',
          jti,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return false;
    }
  }

  /**
   * Revokes active status in Redis.
   * - If jti is provided: removes that specific device token from the set (SREM) and marks the JTI as revoked
   *   with a bounded TTL (REVOKED_TOKEN_TTL_SECONDS) to prevent post-signout token reuse, keeping other devices intact.
   * - If jti is omitted: deletes the single user key (DEL), instantaneously invalidating all sessions across all devices.
   *
   * @param userId - The user UUID.
   * @param jti - Optional specific JWT ID to revoke.
   */
  async revokeUser(userId: string, jti?: string): Promise<void> {
    if (!this.redisService?.isConfigured) {
      return;
    }

    try {
      const key = this.getCacheKey(userId);

      if (jti) {
        await this.redisService.srem(key, jti);
        await this.redisService.set(
          `${AUTH_REVOKED_TOKEN_PREFIX}${jti}`,
          '1',
          'EX',
          REVOKED_TOKEN_TTL_SECONDS,
        );
        this.logger.debug('Revoked specific JWT session from Redis cache', {
          step: 'jwt_cache_session_revoked',
          userId,
          jti,
        });
        return;
      }

      // Delete the entire set key to revoke all active sessions for this user in O(1)
      await this.redisService.del(key);

      this.logger.debug('Revoked all user active sessions from Redis cache', {
        step: 'jwt_cache_user_revoked',
        userId,
      });
    } catch (err) {
      this.logger.warn('Failed to revoke user active status from Redis', {
        step: 'jwt_cache_revoke_failed',
        userId,
        jti,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Automatically clears cached active status whenever a user is deleted anywhere in the system.
   *
   * @param event - The user deleted domain event.
   */
  @OnEvent(USER_DELETED_EVENT, { async: true })
  async handleUserDeleted(event: UserDeletedEvent): Promise<void> {
    if (event?.userId) {
      await this.revokeUser(event.userId);
    }
  }
}

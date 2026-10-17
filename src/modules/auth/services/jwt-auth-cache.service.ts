import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { ContextualLogger, LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

import {
  AUTH_USER_ACTIVE_PREFIX,
  DEFAULT_JWT_CACHE_TTL_SECONDS,
} from '../constants';

/**
 * High-performance, short-TTL cache service for active user JWT status in Redis.
 *
 * Caches positive user authorization status to reduce Cloud SQL connection pool pressure
 * and achieve sub-millisecond JWT authentication latency. Supports immediate revocation
 * upon destructive events (account deletion, soft deletion, admin blocking, and signout)
 * with graceful database fallback when Redis is unconfigured or disabled via feature flag.
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

    this.ttlSeconds = Number(
      this.configService.get<number>(
        'JWT_CACHE_TTL_SECONDS',
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      ),
    );
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
      return false;
    }

    try {
      const key = this.getCacheKey(userId);
      const member = jti ?? userId;
      return await this.redisService.sismember(key, member);
    } catch (err) {
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
      await this.redisService.sadd(key, member);
      await this.redisService.expire(key, this.ttlSeconds);
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
   * Revokes active status in Redis.
   * - If jti is provided: removes that specific device token from the set (SREM), keeping other devices intact.
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

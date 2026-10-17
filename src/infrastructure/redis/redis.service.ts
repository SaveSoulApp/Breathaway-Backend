import { Inject, Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';

import { serializeError } from '@common/utils/error.utils';
import { ContextualLogger, LoggerService } from '@core/logger';

import { REDIS_CLIENT } from './redis.constants';

export interface RedisSetOptions {
  ttlSeconds?: number;
  nx?: boolean;
}

/**
 * Resilient, centralized Redis service encapsulating caching and ephemeral token operations.
 *
 * Provides a driver-agnostic abstraction preventing domain services from coupling
 * directly to the underlying `ioredis` npm package. Handles null/optional configurations
 * gracefully when Redis is unconfigured or unavailable.
 */
@Injectable()
export class RedisService {
  private readonly logger: ContextualLogger;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly client: Redis | null,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.forContext(RedisService.name);
  }

  /**
   * Returns whether a live Redis connection is configured and active.
   */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Returns direct access to the underlying Redis driver instance when raw
   * pipelines or multi/exec commands are required.
   */
  get rawClient(): Redis | null {
    return this.client;
  }

  /**
   * Retrieves a string value by key from Redis.
   *
   * @param key - The cache key to retrieve.
   * @returns The string value, or null if the key does not exist or Redis is unconfigured.
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error('Redis GET failed', {
        step: 'redis_get',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Sets a key-value pair in Redis with optional TTL and conditional NX semantics.
   *
   * Overloaded to accept either an options object or standard ioredis arguments ('EX', ttl, 'NX').
   *
   * @param key - The cache key to set.
   * @param value - The string value to store.
   * @param modeOrOptions - Options object or standard 'EX' mode flag.
   * @param ttl - TTL in seconds when using positional arguments.
   * @param flag - 'NX' conditional flag when using positional arguments.
   * @returns 'OK' if successfully set, null if condition not met or Redis is unconfigured.
   */
  async set(
    key: string,
    value: string,
    modeOrOptions?: 'EX' | number | RedisSetOptions,
    ttl?: number,
    flag?: 'NX',
  ): Promise<string | null> {
    if (!this.client) return null;

    try {
      // Positional arguments: set(key, value, 'EX', ttl, 'NX')
      if (modeOrOptions === 'EX' && typeof ttl === 'number') {
        if (flag === 'NX') {
          return await this.client.set(key, value, 'EX', ttl, 'NX');
        }
        return await this.client.set(key, value, 'EX', ttl);
      }

      // Shorthand numeric TTL: set(key, value, ttlSeconds)
      if (typeof modeOrOptions === 'number') {
        return await this.client.set(key, value, 'EX', modeOrOptions);
      }

      // Structured options: set(key, value, { ttlSeconds: 60, nx: true })
      if (typeof modeOrOptions === 'object' && modeOrOptions !== null) {
        const { ttlSeconds, nx } = modeOrOptions;
        if (ttlSeconds && nx) {
          return await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        }
        if (ttlSeconds) {
          return await this.client.set(key, value, 'EX', ttlSeconds);
        }
        if (nx) {
          return await this.client.set(key, value, 'NX');
        }
      }

      return await this.client.set(key, value);
    } catch (error) {
      this.logger.error('Redis SET failed', {
        step: 'redis_set',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Deletes one or more keys from Redis.
   *
   * @param keys - One or more keys to delete.
   * @returns The number of keys deleted (0 if absent or Redis is unconfigured).
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.client || keys.length === 0) return 0;
    try {
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.error('Redis DEL failed', {
        step: 'redis_del',
        keys,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Adds one or more members to a set stored at key.
   *
   * @param key - The set key.
   * @param members - Members to add.
   * @returns Number of elements that were added to the set.
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.client || members.length === 0) return 0;
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      this.logger.error('Redis SADD failed', {
        step: 'redis_sadd',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Returns all members of the set value stored at key.
   *
   * @param key - The set key.
   * @returns Array of set members (empty array if key doesn't exist or Redis is unconfigured).
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.smembers(key);
    } catch (error) {
      this.logger.error('Redis SMEMBERS failed', {
        step: 'redis_smembers',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Removes one or more members from a set stored at key.
   *
   * @param key - The set key.
   * @param members - Members to remove.
   * @returns Number of members that were removed from the set.
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.client || members.length === 0) return 0;
    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      this.logger.error('Redis SREM failed', {
        step: 'redis_srem',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Determines whether a member belongs to the set stored at key.
   *
   * @param key - The set key.
   * @param member - The member to check.
   * @returns True if the member is an element of the set, false if absent or Redis is unconfigured.
   */
  async sismember(key: string, member: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis SISMEMBER failed', {
        step: 'redis_sismember',
        key,
        member,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Sets a timeout on key in seconds.
   *
   * @param key - The key to set expiration on.
   * @param seconds - Expiration duration in seconds.
   * @returns 1 if the timeout was set, 0 if key does not exist or Redis is unconfigured.
   */
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      this.logger.error('Redis EXPIRE failed', {
        step: 'redis_expire',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }

  /**
   * Pings the Redis server to verify responsiveness and liveness.
   *
   * @returns 'PONG' on success, or null if Redis is unconfigured.
   */
  async ping(): Promise<string | null> {
    if (!this.client) return null;
    return this.client.ping();
  }

  /**
   * Returns the remaining time-to-live of a key in seconds.
   *
   * @param key - Cache key.
   * @returns Remaining TTL in seconds, -1 if no TTL, -2 if key does not exist.
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) return -2;
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error('Redis TTL failed', {
        step: 'redis_ttl',
        key,
        err: serializeError(error),
      });
      throw error;
    }
  }
}

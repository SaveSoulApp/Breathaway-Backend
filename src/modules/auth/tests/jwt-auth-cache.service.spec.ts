import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { LOG_EVENT, LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';
import { UserDeletedEvent } from '@modules/profiles/events';

import {
  AUTH_REVOKED_TOKEN_PREFIX,
  AUTH_USER_ACTIVE_PREFIX,
  DEFAULT_JWT_CACHE_TTL_SECONDS,
  REVOKED_TOKEN_TTL_SECONDS,
} from '../constants';
import { JwtAuthCacheService } from '../services/jwt-auth-cache.service';

describe('JwtAuthCacheService', () => {
  let service: JwtAuthCacheService;
  let mockRedisService: {
    isConfigured: boolean;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    smembers: jest.Mock;
    srem: jest.Mock;
    sismember: jest.Mock;
    saddWithExpire: jest.Mock;
    expire: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };
  let mockLogger: {
    log: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    event: jest.Mock;
  };
  let mockLoggerService: {
    forContext: jest.Mock;
  };

  const createModule = async (
    configValues: Record<string, unknown> = {},
    isRedisConfigured = true,
  ) => {
    mockRedisService = {
      isConfigured: isRedisConfigured,
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn(),
      srem: jest.fn(),
      sismember: jest.fn(),
      saddWithExpire: jest.fn(),
      expire: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key in configValues) return configValues[key];
        return defaultValue;
      }),
    };

    mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      event: jest.fn(),
    };

    mockLoggerService = {
      forContext: jest.fn().mockReturnValue(mockLogger),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthCacheService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        {
          provide: RedisService,
          useValue: isRedisConfigured ? mockRedisService : null,
        },
      ],
    }).compile();

    return module.get<JwtAuthCacheService>(JwtAuthCacheService);
  };

  beforeEach(async () => {
    service = await createModule();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('returns true when enabled and redis is configured', async () => {
      expect(service.isEnabled).toBe(true);
    });

    it('returns false when JWT_CACHE_ENABLED is false', async () => {
      const disabledService = await createModule({ JWT_CACHE_ENABLED: false });
      expect(disabledService.isEnabled).toBe(false);
    });

    it('returns false when JWT_CACHE_ENABLED is string "false"', async () => {
      const disabledService = await createModule({
        JWT_CACHE_ENABLED: 'false',
      });
      expect(disabledService.isEnabled).toBe(false);
    });

    it('returns false when Redis is unconfigured', async () => {
      const unconfiguredService = await createModule({}, false);
      expect(unconfiguredService.isEnabled).toBe(false);
    });
  });

  describe('TTL sanitization', () => {
    it('falls back to default TTL when configured TTL is 0, negative, or NaN', async () => {
      const zeroService = await createModule({ JWT_CACHE_TTL_SECONDS: 0 });
      await zeroService.setUserActive('user-1', 'jti-1');
      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        expect.any(String),
        'jti-1',
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );

      const invalidService = await createModule({
        JWT_CACHE_TTL_SECONDS: 'invalid-non-number',
      });
      await invalidService.setUserActive('user-1', 'jti-1');
      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        expect.any(String),
        'jti-1',
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );
    });
  });

  describe('isUserActive', () => {
    const userId = 'user-uuid-1';
    const jti = 'jti-token-abc';

    it('returns true when Redis set contains jti member for user', async () => {
      mockRedisService.sismember.mockResolvedValue(true);

      const result = await service.isUserActive(userId, jti);

      expect(mockRedisService.sismember).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        jti,
      );
      expect(result).toBe(true);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_HIT,
        expect.objectContaining({ userId, jti, step: 'auth_cache_hit' }),
      );
    });

    it('returns true when Redis set contains fallback member for user without jti', async () => {
      mockRedisService.sismember.mockResolvedValue(true);

      const result = await service.isUserActive(userId);

      expect(mockRedisService.sismember).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        userId,
      );
      expect(result).toBe(true);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_HIT,
        expect.objectContaining({
          userId,
          jti: undefined,
          step: 'auth_cache_hit',
        }),
      );
    });

    it('returns false on cache miss (sismember returns false)', async () => {
      mockRedisService.sismember.mockResolvedValue(false);

      const result = await service.isUserActive(userId, jti);

      expect(result).toBe(false);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_MISS,
        expect.objectContaining({ userId, jti, step: 'auth_cache_miss' }),
      );
    });

    it('returns false and logs warning when Redis throws error', async () => {
      mockRedisService.sismember.mockRejectedValue(
        new Error('Connection reset'),
      );

      const result = await service.isUserActive(userId, jti);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to query user active cache in Redis, falling back to database',
        expect.objectContaining({ userId, jti }),
      );
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_FALLBACK,
        expect.objectContaining({ userId, jti, reason: 'redis_error' }),
      );
    });

    it('returns false immediately when cache is disabled', async () => {
      const disabledService = await createModule({ JWT_CACHE_ENABLED: false });

      const result = await disabledService.isUserActive(userId, jti);

      expect(result).toBe(false);
      expect(mockRedisService.sismember).not.toHaveBeenCalled();
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_FALLBACK,
        expect.objectContaining({ userId, jti, reason: 'cache_disabled' }),
      );
    });
  });

  describe('isTokenRevoked', () => {
    const jti = 'jti-token-xyz';

    it('returns true when token JTI is blacklisted in Redis', async () => {
      mockRedisService.get.mockResolvedValue('1');

      const result = await service.isTokenRevoked(jti);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `${AUTH_REVOKED_TOKEN_PREFIX}${jti}`,
      );
      expect(result).toBe(true);
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_REVOCATION_BLOCKED,
        expect.objectContaining({ jti, step: 'auth_cache_revocation_blocked' }),
      );
    });

    it('returns false when token JTI is not blacklisted (null in Redis)', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.isTokenRevoked(jti);

      expect(result).toBe(false);
    });

    it('returns false immediately without calling Redis when jti is undefined', async () => {
      const result = await service.isTokenRevoked(undefined);

      expect(result).toBe(false);
      expect(mockRedisService.get).not.toHaveBeenCalled();
    });

    it('returns false and logs warning when Redis throws error', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis timeout'));

      const result = await service.isTokenRevoked(jti);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to query revoked token status in Redis, defaulting to unrevoked',
        expect.objectContaining({ jti }),
      );
    });
  });

  describe('setUserActive', () => {
    const userId = 'user-uuid-1';
    const jti = 'jti-token-abc';

    it('adds jti to user set using saddWithExpire pipeline', async () => {
      mockRedisService.saddWithExpire.mockResolvedValue(1);

      await service.setUserActive(userId, jti);

      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        jti,
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );
    });

    it('uses custom JWT_CACHE_TTL_SECONDS from config', async () => {
      const customService = await createModule({ JWT_CACHE_TTL_SECONDS: 600 });
      mockRedisService.saddWithExpire.mockResolvedValue(1);

      await customService.setUserActive(userId, jti);

      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        jti,
        600,
      );
    });

    it('adds userId as set member when jti is omitted', async () => {
      mockRedisService.saddWithExpire.mockResolvedValue(1);

      await service.setUserActive(userId);

      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        userId,
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );
    });

    it('appends multiple device sessions (laptop and phone) into the exact same user set', async () => {
      const laptopJti = 'jti_laptop_111';
      const phoneJti = 'jti_phone_222';
      mockRedisService.saddWithExpire.mockResolvedValue(1);

      // Laptop logs in
      await service.setUserActive(userId, laptopJti);
      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        laptopJti,
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );

      // Phone logs in
      await service.setUserActive(userId, phoneJti);
      expect(mockRedisService.saddWithExpire).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        phoneJti,
        DEFAULT_JWT_CACHE_TTL_SECONDS,
      );
      // Both sessions use the exact same key user:active:<userId>
      expect(service.getCacheKey(userId)).toBe(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
      );
    });

    it('does not throw and logs warning when Redis saddWithExpire fails', async () => {
      mockRedisService.saddWithExpire.mockRejectedValue(
        new Error('Redis full'),
      );

      await expect(service.setUserActive(userId, jti)).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cache user active status in Redis',
        expect.objectContaining({ userId, jti }),
      );
    });

    it('does nothing when cache is disabled', async () => {
      const disabledService = await createModule({ JWT_CACHE_ENABLED: false });

      await disabledService.setUserActive(userId, jti);

      expect(mockRedisService.saddWithExpire).not.toHaveBeenCalled();
    });
  });

  describe('revokeUser', () => {
    const userId = 'user-uuid-1';
    const jti = 'jti-token-abc';

    it('revokes specific device session via srem and blacklists jti in Redis', async () => {
      mockRedisService.srem.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      await service.revokeUser(userId, jti);

      expect(mockRedisService.srem).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
        jti,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `${AUTH_REVOKED_TOKEN_PREFIX}${jti}`,
        '1',
        'EX',
        REVOKED_TOKEN_TTL_SECONDS,
      );
      expect(mockRedisService.del).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Revoked specific JWT session from Redis cache',
        expect.objectContaining({ userId, jti }),
      );
    });

    it('bulk revokes all active sessions by deleting the single user set key when jti is omitted', async () => {
      mockRedisService.del.mockResolvedValue(1);

      await service.revokeUser(userId);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `${AUTH_USER_ACTIVE_PREFIX}${userId}`,
      );
      expect(mockRedisService.srem).not.toHaveBeenCalled();
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Revoked all user active sessions from Redis cache',
        expect.objectContaining({ userId }),
      );
    });

    it('does nothing when Redis is unconfigured', async () => {
      const unconfiguredService = await createModule({}, false);

      await expect(
        unconfiguredService.revokeUser(userId),
      ).resolves.not.toThrow();
    });

    it('does not throw and logs warning when Redis operation fails', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Cluster timeout'));

      await expect(service.revokeUser(userId)).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to revoke user active status from Redis',
        expect.objectContaining({ userId }),
      );
    });
  });

  describe('handleUserDeleted (USER_DELETED_EVENT listener)', () => {
    it('revokes user active cache when USER_DELETED_EVENT is dispatched', async () => {
      const revokeSpy = jest
        .spyOn(service, 'revokeUser')
        .mockResolvedValue(undefined);

      await service.handleUserDeleted(
        new UserDeletedEvent('deleted-user-uuid'),
      );

      expect(revokeSpy).toHaveBeenCalledWith('deleted-user-uuid');
    });
  });
});

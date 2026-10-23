import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { RedisService } from '@infrastructure/redis';

import { JwtAuthCacheService } from '../services/jwt-auth-cache.service';
import { JwtStrategy } from '../strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: {
    user: {
      findFirst: jest.Mock;
    };
  };
  let configService: {
    getOrThrow: jest.Mock;
    get: jest.Mock;
  };
  let jwtAuthCacheService: {
    isUserActive: jest.Mock;
    setUserActive: jest.Mock;
    isTokenRevoked: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'JWT_AUDIENCE') return 'breathaway-client';
        return undefined;
      }),
      get: jest.fn((key: string) => {
        if (key === 'JWT_ISSUER') return 'https://breathaway.app';
        return undefined;
      }),
    };

    jwtAuthCacheService = {
      isUserActive: jest.fn(),
      setUserActive: jest.fn(),
      isTokenRevoked: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtAuthCacheService, useValue: jwtAuthCacheService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    const payload = {
      sub: 'user-uuid-1',
      email: 'test@example.com',
      jti: 'jti-token-xyz',
    };

    it('should return userId, email, and jti immediately when user is cached in Redis without hitting Prisma', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(true);

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });
      expect(jwtAuthCacheService.isUserActive).toHaveBeenCalledWith(
        'user-uuid-1',
        'jti-token-xyz',
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(jwtAuthCacheService.setUserActive).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token JTI has been revoked', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(false);
      jwtAuthCacheService.isTokenRevoked.mockResolvedValue(true);

      // Act & Assert
      await expect(strategy.validate(payload)).rejects.toThrow(
        'Session has been revoked',
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(jwtAuthCacheService.setUserActive).not.toHaveBeenCalled();
    });

    it('should query Prisma on cache miss, cache active status, and return user payload', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(false);
      jwtAuthCacheService.isTokenRevoked.mockResolvedValue(false);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1', deletedAt: null },
        select: { id: true },
      });
      expect(jwtAuthCacheService.setUserActive).toHaveBeenCalledWith(
        'user-uuid-1',
        'jti-token-xyz',
      );
    });

    it('should throw UnauthorizedException and not cache when user record is not found in database', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(false);
      jwtAuthCacheService.isTokenRevoked.mockResolvedValue(false);
      prisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtAuthCacheService.setUserActive).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user is soft-deleted', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(false);
      jwtAuthCacheService.isTokenRevoked.mockResolvedValue(false);
      prisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User account is invalid or has been deactivated',
      );
      expect(jwtAuthCacheService.setUserActive).not.toHaveBeenCalled();
    });

    it('should return familyId along with user payload when present in token', async () => {
      // Arrange
      jwtAuthCacheService.isUserActive.mockResolvedValue(true);

      // Act
      const result = await strategy.validate({
        ...payload,
        familyId: 'family-xyz',
      });

      // Assert
      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
        familyId: 'family-xyz',
      });
    });
  });

  describe('Integration: RedisService failure fallback resilience', () => {
    let integrationStrategy: JwtStrategy;
    let integrationPrisma: {
      user: { findFirst: jest.Mock };
    };
    let mockRedisService: {
      isConfigured: boolean;
      sismember: jest.Mock;
      saddWithExpire: jest.Mock;
      get: jest.Mock;
    };
    let mockLogger: {
      log: jest.Mock;
      debug: jest.Mock;
      warn: jest.Mock;
      error: jest.Mock;
      event: jest.Mock;
    };

    beforeEach(async () => {
      integrationPrisma = {
        user: {
          findFirst: jest.fn(),
        },
      };

      mockRedisService = {
        isConfigured: true,
        sismember: jest.fn(),
        saddWithExpire: jest.fn(),
        get: jest.fn(),
      };

      mockLogger = {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        event: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtStrategy,
          JwtAuthCacheService,
          { provide: ConfigService, useValue: configService },
          { provide: PrismaService, useValue: integrationPrisma },
          { provide: RedisService, useValue: mockRedisService },
          {
            provide: LoggerService,
            useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
          },
        ],
      }).compile();

      integrationStrategy = module.get<JwtStrategy>(JwtStrategy);
    });

    it('falls back seamlessly to PostgreSQL when RedisService.sismember rejects with connection timeout', async () => {
      mockRedisService.sismember.mockRejectedValue(
        new Error('ETIMEDOUT: Redis connection timed out after 5000ms'),
      );
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.saddWithExpire.mockResolvedValue(undefined);
      integrationPrisma.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      const result = await integrationStrategy.validate({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });

      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });
      expect(integrationPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1', deletedAt: null },
        select: { id: true },
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to query user active cache in Redis, falling back to database',
        expect.objectContaining({ userId: 'user-uuid-1' }),
      );
      expect(mockLogger.event).toHaveBeenCalledWith(
        LOG_EVENT.AUTH_CACHE_FALLBACK,
        expect.objectContaining({ reason: 'redis_error' }),
      );
    });

    it('successfully authenticates via DB even if RedisService fails on both read and write', async () => {
      mockRedisService.sismember.mockRejectedValue(
        new Error('ECONNREFUSED: Redis cluster unavailable'),
      );
      mockRedisService.get.mockRejectedValue(
        new Error('ECONNREFUSED: Redis cluster unavailable'),
      );
      mockRedisService.saddWithExpire.mockRejectedValue(
        new Error('ECONNREFUSED: Redis cluster unavailable'),
      );
      integrationPrisma.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      const result = await integrationStrategy.validate({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });

      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
        jti: 'jti-token-xyz',
      });
      expect(integrationPrisma.user.findFirst).toHaveBeenCalled();
    });

    it('rejects with 401 when user is not found in database even during Redis failure', async () => {
      mockRedisService.sismember.mockRejectedValue(new Error('Redis crash'));
      mockRedisService.get.mockRejectedValue(new Error('Redis crash'));
      integrationPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        integrationStrategy.validate({
          sub: 'user-uuid-1',
          email: 'test@example.com',
          jti: 'jti-token-xyz',
        }),
      ).rejects.toThrow('User account is invalid or has been deactivated');
    });
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@infrastructure/database/prisma.service';

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
  });
});

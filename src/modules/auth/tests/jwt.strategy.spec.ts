import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@infrastructure/database/prisma.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    const payload = {
      sub: 'user-uuid-1',
      email: 'test@example.com',
    };

    it('should return userId and email when user exists and is not deleted', async () => {
      // Arrange
      prisma.user.findFirst.mockResolvedValue({ id: 'user-uuid-1' });

      // Act
      const result = await strategy.validate(payload);

      // Assert
      expect(result).toEqual({
        userId: 'user-uuid-1',
        email: 'test@example.com',
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1', deletedAt: null },
        select: { id: true },
      });
    });

    it('should throw UnauthorizedException when user record is not found', async () => {
      // Arrange
      prisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is soft-deleted', async () => {
      // Arrange
      prisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User account is invalid or has been deactivated',
      );
    });
  });
});

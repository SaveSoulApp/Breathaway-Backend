jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuditActionType } from '@modules/audit/dto';

import { AuthTokenService } from '../services/auth-token.service';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let clsService: { get: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock; decode: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    userSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
    };
  };

  const mockUser: User = {
    id: 'user-auth-123',
    countryCode: 'US',
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  beforeEach(async () => {
    clsService = { get: jest.fn() };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
      decode: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, defaultVal?: unknown) => {
        if (key === 'JWT_ISSUER') return 'breathaway-issuer';
        if (key === 'JWT_AUDIENCE') return 'breathaway-client';
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '14d';
        return defaultVal;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_AUDIENCE') return 'breathaway-client';
        if (key === 'JWT_SECRET') return 'secret';
        return 'test-val';
      }),
    };
    eventEmitter = { emit: jest.fn() };
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      userSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-123' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'session-123' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: ClsService, useValue: clsService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAuthResponse', () => {
    it('should generate tokens, persist session, and emit user login audit log without metadata', async () => {
      // Act
      const result = await service.generateAuthResponse(mockUser);

      // Assert
      expect(result).toEqual({
        user_id: 'user-auth-123',
        userId: 'user-auth-123',
        token_type: 'Bearer',
        access_token: 'mock-jwt-token',
        expires_in: 900,
        refresh_token: 'mock-jwt-token',
        refresh_token_expires_at: expect.any(String),
      });
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-auth-123',
          jti: 'mocked-id',
          tokenHash: expect.any(String),
          familyId: 'mocked-id',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGIN,
          userId: 'user-auth-123',
        }),
      );
    });

    it('should include metadata in audit log and preserve familyId when provided', async () => {
      // Arrange
      const metadata = {
        ipAddress: '1.2.3.4',
        deviceId: 'device-1',
        familyId: 'existing-family',
      };

      // Act
      const result = await service.generateAuthResponse(mockUser, metadata);

      // Assert
      expect(result.access_token).toBe('mock-jwt-token');
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          familyId: 'existing-family',
          deviceId: 'device-1',
          ipAddress: '1.2.3.4',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGIN,
          userId: 'user-auth-123',
          metadata,
        }),
      );
    });

    it('should fallback to CLS context for ipAddress, userAgent, and deviceId when not in metadata', async () => {
      // Arrange
      clsService.get.mockImplementation((key: string) => {
        if (key === 'ipAddress') return '198.51.100.5';
        if (key === 'userAgent') return 'CustomAgent/2.0';
        if (key === 'deviceId') return 'cls-device-id';
        return undefined;
      });

      // Act
      await service.generateAuthResponse(mockUser);

      // Assert
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-auth-123',
          ipAddress: '198.51.100.5',
          userAgent: 'CustomAgent/2.0',
          deviceId: 'cls-device-id',
        }),
      });
    });

    it('should successfully sign and verify tokens using real JwtService without options conflict', async () => {
      const realJwtService = new JwtService({ secret: 'test-secret' });
      const realService = new AuthTokenService(
        { forContext: jest.fn().mockReturnValue(mockLogger) } as any,
        realJwtService,
        configService as any,
        prisma as any,
      );
      Object.assign(realService, { cls: clsService, eventEmitter });

      const result = await realService.generateAuthResponse(mockUser);

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();

      const decodedAccess = realJwtService.verify(result.access_token, {
        audience: 'breathaway-client',
        issuer: 'breathaway-issuer',
      });
      expect(decodedAccess.sub).toBe('user-auth-123');
      expect(decodedAccess.aud).toBe('breathaway-client');

      const decodedRefresh = realJwtService.verify(result.refresh_token, {
        audience: 'breathaway-client:refresh',
        issuer: 'breathaway-issuer',
      });
      expect(decodedRefresh.sub).toBe('user-auth-123');
      expect(decodedRefresh.aud).toBe('breathaway-client:refresh');
      expect(decodedRefresh.token_type).toBe('refresh');
      expect(decodedRefresh.familyId).toBeDefined();

      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-real',
        userId: 'user-auth-123',
        jti: decodedRefresh.jti,
        familyId: decodedRefresh.familyId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const refreshedResult = await realService.refreshToken({
        refreshToken: result.refresh_token,
      });

      expect(refreshedResult.access_token).toBeDefined();
      expect(refreshedResult.refresh_token).toBeDefined();
    });
  });

  describe('refreshToken', () => {
    it('should rotate tokens successfully when a valid refresh token is provided', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);

      // Act
      const result = await service.refreshToken({
        refreshToken: 'valid-refresh-token',
      });

      // Assert
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.access_token).toBe('mock-jwt-token');
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          familyId: 'family-1',
        }),
      });
    });

    it('should forward request metadata and retain deviceId on token rotation', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        deviceId: 'original-device',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);

      // Act
      await service.refreshToken(
        { refreshToken: 'valid-refresh-token' },
        { ipAddress: '10.0.0.1', userAgent: 'NewAgent/1.0' },
      );

      // Assert
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          familyId: 'family-1',
          deviceId: 'original-device',
          ipAddress: '10.0.0.1',
          userAgent: 'NewAgent/1.0',
        }),
      });
    });

    it('should trigger reuse detection and revoke family when an already-revoked token is presented', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'revoked-jti',
        familyId: 'family-breached',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-compromised',
        userId: 'user-auth-123',
        jti: 'revoked-jti',
        familyId: 'family-breached',
        revokedAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() + 100000),
      });

      // Act & Assert
      await expect(
        service.refreshToken({ refreshToken: 'stolen-token' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-breached', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should trigger reuse detection and revoke family if a concurrent request already consumed the token (race condition)', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-race',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-race',
        userId: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-race',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      // Simulate CAS failure: another parallel request already updated revokedAt
      prisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 });

      // Act & Assert
      await expect(
        service.refreshToken({ refreshToken: 'concurrent-token' }),
      ).rejects.toThrow(UnauthorizedException);

      // Verify the CAS check was attempted
      expect(prisma.userSession.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'session-race', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // Verify the entire family was revoked due to race / reuse detection
      expect(prisma.userSession.updateMany).toHaveBeenNthCalledWith(2, {
        where: { familyId: 'family-race', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException when refresh token is expired', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'expired-jti',
        familyId: 'family-1',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-auth-123',
        jti: 'expired-jti',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 5000), // EXPIRED!
      });

      // Act & Assert
      await expect(
        service.refreshToken({ refreshToken: 'expired-token' }),
      ).rejects.toThrow('Refresh token has expired');
    });

    it('should throw UnauthorizedException when user has been soft-deleted', async () => {
      // Arrange
      jwtService.verify.mockReturnValue({
        sub: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        token_type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-auth-123',
        jti: 'valid-jti',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findFirst.mockResolvedValue(null); // Deleted user!

      // Act & Assert
      await expect(
        service.refreshToken({ refreshToken: 'valid-token' }),
      ).rejects.toThrow('User account is invalid or has been deactivated');
    });
  });

  describe('revokeSession', () => {
    it('should revoke all active sessions for user when no token is provided', async () => {
      // Act
      await service.revokeSession('user-auth-123');

      // Assert
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-auth-123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should revoke specific family lineage when refresh token with familyId is decoded', async () => {
      // Arrange
      jwtService.decode.mockReturnValue({ familyId: 'target-family' });

      // Act
      await service.revokeSession('user-auth-123', 'some-refresh-token');

      // Assert
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-auth-123',
          familyId: 'target-family',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});

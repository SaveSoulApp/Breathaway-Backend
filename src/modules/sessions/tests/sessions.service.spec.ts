import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { JwtAuthCacheService } from '@modules/auth/services/jwt-auth-cache.service';

import { SessionsService } from '../sessions.service';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: MockPrismaService;
  let jwtAuthCacheService: { revokeUser: jest.Mock };
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    event: jest.Mock;
    verbose: jest.Mock;
  };

  const mockUserId = '01M5USER00000000000000001';

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
      verbose: jest.fn(),
    };

    const logger = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    } as unknown as jest.Mocked<LoggerService>;

    prisma = createPrismaMock();

    jwtAuthCacheService = {
      revokeUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtAuthCacheService, useValue: jwtAuthCacheService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserSessions', () => {
    it('should return empty list when user has no active sessions or devices', async () => {
      // Arrange
      prisma.userSession.findMany.mockResolvedValue([]);
      prisma.device.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getUserSessions(mockUserId);

      // Assert
      expect(result).toEqual({
        sessions: [],
        registeredDevices: [],
        totalActiveSessions: 0,
      });
      expect(prisma.userSession.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should return active sessions with device correlation and isCurrent flags', async () => {
      // Arrange
      const now = new Date();
      const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const mockSessions = [
        {
          id: '01SESSION1',
          userId: mockUserId,
          jti: 'jti-1',
          tokenHash: 'hash-1',
          familyId: 'family-1',
          deviceId: 'device-iphone',
          userAgent: 'BreathAway/1.2.0 (iOS 17.5; iPhone15,2)',
          ipAddress: '49.43.243.115',
          expiresAt: expiry,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: '01SESSION2',
          userId: mockUserId,
          jti: 'jti-2',
          tokenHash: 'hash-2',
          familyId: 'family-2',
          deviceId: 'web',
          userAgent: 'BreathAway/1.0.0 (Web 1.0; Browser)',
          ipAddress: '152.57.10.2',
          expiresAt: expiry,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const mockDevices = [
        {
          id: '01DEVICE1',
          userId: mockUserId,
          token: 'apns-token-1',
          platform: DevicePlatform.IOS,
          deviceId: 'device-iphone',
          appVersion: '1.2.0',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ];

      prisma.userSession.findMany.mockResolvedValue(mockSessions as any);
      prisma.device.findMany.mockResolvedValue(mockDevices as any);

      // Act
      const result = await service.getUserSessions(
        mockUserId,
        'family-1',
        'device-iphone',
      );

      // Assert
      expect(result.totalActiveSessions).toBe(2);
      expect(result.sessions).toHaveLength(2);

      // First session matches family-1 -> isCurrent true
      const session1 = result.sessions[0];
      expect(session1.id).toBe('01SESSION1');
      expect(session1.isCurrent).toBe(true);
      expect(session1.ipAddress).toBe('49.43.243.115');
      expect(session1.device.platform).toBe(DevicePlatform.IOS);
      expect(session1.device.deviceModel).toBe('iPhone15,2');
      expect(session1.device.pushEnabled).toBe(true);

      // Second session does not match family-1 -> isCurrent false
      const session2 = result.sessions[1];
      expect(session2.id).toBe('01SESSION2');
      expect(session2.isCurrent).toBe(false);
      expect(session2.device.platform).toBe(DevicePlatform.WEB);
      expect(session2.device.pushEnabled).toBe(false);

      // Registered devices
      expect(result.registeredDevices).toHaveLength(1);
      expect(result.registeredDevices[0].hasActiveSession).toBe(true);
    });

    it('should fallback to deviceId matching if currentFamilyId is not provided', async () => {
      // Arrange
      const now = new Date();
      const expiry = new Date(Date.now() + 100000);

      const mockSessions = [
        {
          id: '01SESSION1',
          userId: mockUserId,
          jti: 'jti-1',
          tokenHash: 'hash-1',
          familyId: 'family-1',
          deviceId: 'target-device-id',
          userAgent: 'BreathAway/1.0.0 (Web 1.0; Browser)',
          ipAddress: '1.2.3.4',
          expiresAt: expiry,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      prisma.userSession.findMany.mockResolvedValue(mockSessions as any);
      prisma.device.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getUserSessions(
        mockUserId,
        undefined,
        'target-device-id',
      );

      // Assert
      expect(result.sessions[0].isCurrent).toBe(true);
    });
  });

  describe('revokeSession', () => {
    it('should successfully revoke session by id, deactivate device, and clear cache', async () => {
      // Arrange
      const mockSession = {
        id: '01SESSION1',
        userId: mockUserId,
        familyId: 'family-1',
        deviceId: 'device-1',
        jti: 'jti-1',
        revokedAt: null,
      };

      prisma.userSession.findFirst.mockResolvedValue(mockSession as any);
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      prisma.device.updateMany.mockResolvedValue({ count: 1 });

      // Act
      await service.revokeSession(mockUserId, '01SESSION1');

      // Assert
      expect(prisma.userSession.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          OR: [{ id: '01SESSION1' }, { familyId: '01SESSION1' }],
          revokedAt: null,
        },
      });

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          familyId: 'family-1',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          deviceId: 'device-1',
          isActive: true,
        },
        data: { isActive: false },
      });

      expect(jwtAuthCacheService.revokeUser).toHaveBeenCalledWith(
        mockUserId,
        'jti-1',
      );
    });

    it('should throw NotFoundException when session is not found or already revoked', async () => {
      // Arrange
      prisma.userSession.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.revokeSession(mockUserId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeAllOtherSessions', () => {
    it('should revoke all sessions except the current familyId and deactivate other devices', async () => {
      // Arrange
      prisma.userSession.updateMany.mockResolvedValue({ count: 3 });
      prisma.device.updateMany.mockResolvedValue({ count: 2 });

      // Act
      const result = await service.revokeAllOtherSessions(
        mockUserId,
        'current-family-id',
        'current-device-id',
      );

      // Assert
      expect(result).toEqual({ revokedCount: 3 });

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          familyId: { not: 'current-family-id' },
        },
        data: { revokedAt: expect.any(Date) },
      });

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          deviceId: { not: 'current-device-id' },
          isActive: true,
        },
        data: { isActive: false },
      });
    });
  });
});

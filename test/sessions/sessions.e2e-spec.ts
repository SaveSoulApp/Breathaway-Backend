import * as crypto from 'crypto';

import { HttpStatus, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DevicePlatform } from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { SessionsModule } from '@modules/sessions/sessions.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('SessionsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let user1Id: string;
  let user1Jwt: string;
  let currentFamilyId: string;
  let otherFamilyId: string;
  let otherSessionId: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([SessionsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    // 1. Seed user
    const user = await prisma.user.create({ data: {} });
    user1Id = user.id;
    allCreatedUserIds.push(user.id);

    currentFamilyId = crypto.randomUUID();
    otherFamilyId = crypto.randomUUID();

    // 2. Issue valid JWT with familyId claim for user1
    user1Jwt = jwtService.sign({
      sub: user1Id,
      familyId: currentFamilyId,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 3. Seed active device
    await prisma.device.create({
      data: {
        userId: user1Id,
        deviceId: 'device-current-001',
        token: crypto.randomBytes(16).toString('hex'),
        platform: DevicePlatform.IOS,
        isActive: true,
      },
    });

    // 4. Seed current session (matching currentFamilyId)
    await prisma.userSession.create({
      data: {
        userId: user1Id,
        jti: crypto.randomUUID(),
        tokenHash: crypto.randomBytes(32),
        familyId: currentFamilyId,
        deviceId: 'device-current-001',
        userAgent: 'BreathAway/1.0.0 (iOS 17.0; iPhone15,2)',
        ipAddress: '127.0.0.1',
        expiresAt: futureExpiry,
      },
    });

    // 5. Seed second active session (other device/browser)
    const otherSession = await prisma.userSession.create({
      data: {
        userId: user1Id,
        jti: crypto.randomUUID(),
        tokenHash: crypto.randomBytes(32),
        familyId: otherFamilyId,
        deviceId: 'device-other-002',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
        ipAddress: '127.0.0.1',
        expiresAt: futureExpiry,
      },
    });
    otherSessionId = otherSession.id;
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: { userId: { in: allCreatedUserIds } },
    });
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('GET /api/v1/sessions', () => {
    it('should reject unauthenticated requests with 401', async () => {
      // Act
      const res = await authedRequest(app).get('/api/v1/sessions');

      // Assert
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return active sessions and registered devices for authenticated user', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/sessions')
        .set('authorization', `Bearer ${user1Jwt}`)
        .set('x-device-id', 'device-current-001');

      // Assert
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('sessions');
      expect(res.body).toHaveProperty('registeredDevices');
      expect(res.body).toHaveProperty('totalActiveSessions');
      expect(res.body.totalActiveSessions).toBeGreaterThanOrEqual(2);

      const sessions = res.body.sessions;
      expect(Array.isArray(sessions)).toBe(true);

      const current = sessions.find(
        (s: { familyId: string }) => s.familyId === currentFamilyId,
      );
      expect(current).toBeDefined();
      expect(current.isCurrent).toBe(true);
      expect(current.device).toBeDefined();
      expect(current.device.platform).toBe(DevicePlatform.IOS);
    });
  });

  describe('DELETE /api/v1/sessions/:id', () => {
    it('should reject unauthenticated requests with 401', async () => {
      // Act
      const res = await authedRequest(app).delete(
        `/api/v1/sessions/${otherSessionId}`,
      );

      // Assert
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 when revoking a non-existent or foreign session', async () => {
      // Act
      const res = await authedRequest(app)
        .delete('/api/v1/sessions/non-existent-session-id')
        .set('authorization', `Bearer ${user1Jwt}`);

      // Assert
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('should successfully revoke specific session with 204 No Content', async () => {
      // Act
      const res = await authedRequest(app)
        .delete(`/api/v1/sessions/${otherSessionId}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      // Assert
      expect(res.status).toBe(HttpStatus.NO_CONTENT);

      // Verify in DB that revokedAt is set
      const revoked = await prisma.userSession.findUnique({
        where: { id: otherSessionId },
      });
      expect(revoked?.revokedAt).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/sessions', () => {
    it('should reject unauthenticated requests with 401', async () => {
      // Act
      const res = await authedRequest(app).delete('/api/v1/sessions');

      // Assert
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should revoke all other active sessions except the calling session', async () => {
      // Arrange - Seed another active session to revoke
      const thirdFamilyId = crypto.randomUUID();
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      await prisma.userSession.create({
        data: {
          userId: user1Id,
          jti: crypto.randomUUID(),
          tokenHash: crypto.randomBytes(32),
          familyId: thirdFamilyId,
          deviceId: 'device-third-003',
          userAgent: 'BreathAway/1.0.0 (Android 14; Pixel 8)',
          ipAddress: '127.0.0.1',
          expiresAt: futureExpiry,
        },
      });

      // Act
      const res = await authedRequest(app)
        .delete('/api/v1/sessions')
        .set('authorization', `Bearer ${user1Jwt}`)
        .set('x-device-id', 'device-current-001');

      // Assert
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty('revokedCount');
      expect(res.body.revokedCount).toBeGreaterThanOrEqual(1);

      // Verify current session is still active
      const currentSession = await prisma.userSession.findFirst({
        where: { userId: user1Id, familyId: currentFamilyId },
      });
      expect(currentSession?.revokedAt).toBeNull();
    });
  });
});

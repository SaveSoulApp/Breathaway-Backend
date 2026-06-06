import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { DevicesModule } from '@modules/devices/devices.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';
import { Platform } from '@common/interfaces';

describe('DevicesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([DevicesModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Device Endpoints', () => {
    let seededUserId: string;
    let validJwt: string;

    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);

      validJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    it('POST /api/v1/devices - registers a device', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          token: 'test-fcm-token-1',
          platform: Platform.IOS,
          deviceId: 'ios-device-123',
          appVersion: '1.0.0',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        token: 'test-fcm-token-1',
        platform: 'IOS',
        deviceId: 'e2e-test-device-001',
        userId: seededUserId,
        isActive: true,
      });
    });

    it('POST /api/v1/devices - fails if token already registered for the same user', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          token: 'test-fcm-token-1', // same token
        });

      expect(res.status).toBe(409);
    });

    it('GET /api/v1/devices - returns all devices for user', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        token: 'test-fcm-token-1',
      });
    });

    it('GET /api/v1/devices/:id - returns device by ID', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`);

      const deviceId = allRes.body[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(deviceId);
    });

    it('PUT /api/v1/devices/:id - updates device completely', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`);

      const deviceId = allRes.body[0].id;

      const res = await authedRequest(app)
        .put(`/api/v1/devices/${deviceId}`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          token: 'test-fcm-token-updated',
          platform: Platform.ANDROID,
          deviceId: 'android-device-456',
          appVersion: '2.0.0',
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        token: 'test-fcm-token-updated',
        platform: 'ANDROID',
        isActive: false,
      });
    });

    it('PATCH /api/v1/devices/:id - partially updates device', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`);

      const deviceId = allRes.body[0].id;

      const res = await authedRequest(app)
        .patch(`/api/v1/devices/${deviceId}`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(res.body.token).toBe('test-fcm-token-updated'); // Remains unchanged
    });

    it('DELETE /api/v1/devices/:id - deletes device', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/devices')
        .set('authorization', `Bearer ${validJwt}`);

      const deviceId = allRes.body[0].id;

      const res = await authedRequest(app)
        .delete(`/api/v1/devices/${deviceId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(204);

      // Verify it is removed
      const checkRes = await authedRequest(app)
        .get(`/api/v1/devices/${deviceId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(checkRes.status).toBe(404);
    });
  });
});

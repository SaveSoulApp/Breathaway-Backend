import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportsModule } from '@modules/reports/reports.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import request from 'supertest';
import * as crypto from 'crypto';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { DevicePlatform, GenderType, IdentityType } from '@prisma/client';
import { AdminModule } from '@modules/admin/admin.module';

describe('ReportsModule (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let prisma: PrismaService;
  let authHeader: string;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';

    // We also include AdminModule just in case AdminBasicAuthGuard needs any global setup from it,
    // but the endpoints are on ReportsModule.
    const context = await createAuthTestApp([ReportsModule, AdminModule]);
    app = context.app;
    configService = app.get(ConfigService);
    prisma = context.prisma;

    const username = configService.get<string>('ADMIN_USERNAME') || 'admin';
    const password = configService.get<string>('ADMIN_PASSWORD') || 'admin';
    const base64 = Buffer.from(`${username}:${password}`).toString('base64');
    authHeader = `Basic ${base64}`;
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('GET /api/v1/reports/total', () => {
    it('should reject unauthorized requests', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/reports/total',
      );
      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid credentials', async () => {
      const invalidAuth = `Basic ${Buffer.from('wrong:wrong').toString('base64')}`;
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/total')
        .set('Authorization', invalidAuth);
      expect(res.status).toBe(401);
    });

    it('should return the total report for authorized admin', async () => {
      // Seed a user to ensure non-zero stats
      const user = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user.id);

      await prisma.userProfile.create({
        data: {
          userId: user.id,
          firstName: 'Admin Test',
          gender: GenderType.MALE,
        },
      });

      // Crypto imported at the top
      await prisma.identity.create({
        data: {
          userId: user.id,
          type: IdentityType.EMAIL,
          publicValueHash: crypto.randomBytes(32).toString('hex'),
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'k',
        },
      });

      await prisma.device.create({
        data: {
          userId: user.id,
          token: crypto.randomBytes(16).toString('hex'),
          platform: DevicePlatform.IOS,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/total')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body.users.total).toBeGreaterThanOrEqual(1);
      expect(res.body.users.completedProfiles).toBeGreaterThanOrEqual(1);
      expect(res.body.identities.split.email).toBeGreaterThanOrEqual(1);
      expect(res.body.devices.platformSplit.ios).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/reports/timeframe', () => {
    it('should return timeframe report for given dates', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/timeframe')
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timeframe');
      expect(res.body.users.acquired).toBeGreaterThanOrEqual(1); // User created in previous test
    });
  });
});

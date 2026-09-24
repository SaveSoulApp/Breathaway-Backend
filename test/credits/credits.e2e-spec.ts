import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CreditSource } from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { AdminModule } from '@modules/admin/admin.module';
import { CreditsModule } from '@modules/credits/credits.module';
import { MaintenanceModule } from '@modules/maintenance/maintenance.module';

import {
  buildBasicAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('CreditsModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let seededUserId: string;
  let validJwt: string;
  let otherUserJwt: string;
  let adminBasicAuthHeader: string;

  beforeAll(async () => {
    process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass';

    const context = await createAuthTestApp([
      CreditsModule,
      MaintenanceModule,
      AdminModule,
    ]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    const user = await prisma.user.create({ data: {} });
    seededUserId = user.id;
    allCreatedUserIds.push(user.id);

    validJwt = jwtService.sign({
      sub: user.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    const otherUser = await prisma.user.create({ data: {} });
    allCreatedUserIds.push(otherUser.id);
    otherUserJwt = jwtService.sign({
      sub: otherUser.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    adminBasicAuthHeader = buildBasicAuthHeader(
      configService.getOrThrow<string>('ADMIN_USERNAME'),
      configService.getOrThrow<string>('ADMIN_PASSWORD'),
    );
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Credits Endpoints', () => {
    let ledgerEntryId: string;

    it('GET /api/v1/credits/balance - returns initial 0 balance', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/credits/balance')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ balance: 0 });
    });

    it('GET /api/v1/credits/balance - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/credits/balance');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/admin/credits/grant - grants credits with admin basic auth and timezone header', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/grant')
        .set('authorization', adminBasicAuthHeader)
        .set('x-timezone', 'UTC')
        .send({
          userId: seededUserId,
          amount: 100,
          source: CreditSource.PURCHASE,
          referenceId: 'test-purchase-123',
        });

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(100);
      expect(res.body.source).toBe(CreditSource.PURCHASE);
      expect(res.body.id).toBeDefined();

      ledgerEntryId = res.body.id;

      // Verify balance increased
      const balRes = await authedRequest(app)
        .get('/api/v1/credits/balance')
        .set('authorization', `Bearer ${validJwt}`);
      expect(balRes.body.balance).toBe(100);
    });

    it('POST /api/v1/admin/credits/grant - rejects when x-timezone header is missing (400)', async () => {
      // Using basic supertest without authedRequest wrapper to omit x-timezone
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/grant')
        .set('authorization', adminBasicAuthHeader)
        .set('x-timezone', '')
        .send({
          userId: seededUserId,
          amount: 50,
          source: CreditSource.PURCHASE,
          referenceId: 'test-purchase-no-tz',
        });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/admin/credits/consume - consumes credits with admin basic auth', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/consume')
        .set('authorization', adminBasicAuthHeader)
        .send({
          userId: seededUserId,
          amount: 25,
          referenceId: 'test-usage-123',
        });

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(25);

      // Verify balance decreased
      const balRes = await authedRequest(app)
        .get('/api/v1/credits/balance')
        .set('authorization', `Bearer ${validJwt}`);
      expect(balRes.body.balance).toBe(75);
    });

    it('GET /api/v1/credits/expiring - returns expiring credits breakdown', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/credits/expiring')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/credits/ledger - returns ledger history', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/credits/ledger')
        .query({ limit: 10, page: 1 })
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('GET /api/v1/credits/ledger/:id - returns single ledger entry', async () => {
      const res = await authedRequest(app)
        .get(`/api/v1/credits/ledger/${ledgerEntryId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ledgerEntryId);
      expect(res.body.amount).toBe(100);
    });

    it('GET /api/v1/credits/ledger/:id - returns 404 when entry belongs to another user', async () => {
      const res = await authedRequest(app)
        .get(`/api/v1/credits/ledger/${ledgerEntryId}`)
        .set('authorization', `Bearer ${otherUserJwt}`);

      expect(res.status).toBe(404);
    });

    it('POST /api/v1/admin/credits/consume - fails when called with user JWT instead of admin basic auth', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/consume')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          userId: seededUserId,
          amount: 10,
          referenceId: 'test-usage-456',
        });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/admin/credits/consume - fails when insufficient balance (402 Payment Required)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/consume')
        .set('authorization', adminBasicAuthHeader)
        .send({
          userId: seededUserId,
          amount: 10000,
          referenceId: 'test-usage-overflow',
        });

      expect(res.status).toBe(402);
    });
  });
});

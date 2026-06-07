import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreditsModule } from '@modules/credits/credits.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';
import { CreditSource } from '@prisma/client';

describe('CreditsModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let seededUserId: string;
  let validJwt: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([CreditsModule]);
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

    it('POST /api/v1/credits/internal/grant - grants credits', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/credits/internal/grant')
        .set('authorization', `Bearer ${validJwt}`)
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

    it('POST /api/v1/credits/internal/consume - consumes credits', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/credits/internal/consume')
        .set('authorization', `Bearer ${validJwt}`)
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

    it('GET /api/v1/credits/ledger - returns ledger history', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/credits/ledger')
        .query({ limit: 10 })
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

    it('POST /api/v1/credits/internal/consume - fails when insufficient balance', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/credits/internal/consume')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          userId: seededUserId,
          amount: 1000,
          referenceId: 'test-usage-456',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient');
    });
    it('POST /api/v1/credits/jobs/expire-bundles - expires credits that are past their expiry date using First-to-Expire logic', async () => {
      // Current state from previous tests:
      // Granted: 100 (no expiry)
      // Consumed: 25

      // Grant a credit that expired in the past
      await authedRequest(app)
        .post('/api/v1/credits/internal/grant')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          userId: seededUserId,
          amount: 50,
          source: CreditSource.ADMIN,
          referenceId: 'expired-grant-1',
          expiresAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        });

      // Grant a credit that expires in the future
      await authedRequest(app)
        .post('/api/v1/credits/internal/grant')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          userId: seededUserId,
          amount: 50,
          source: CreditSource.ADMIN,
          referenceId: 'future-grant-1',
          expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day future
        });

      // Consume more credits
      await authedRequest(app)
        .post('/api/v1/credits/internal/consume')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          userId: seededUserId,
          amount: 10,
          referenceId: 'test-usage-expiring',
        });

      // Total Debits = 25 + 10 = 35.
      // Credits available: 100 (null), 50 (past), 50 (future).
      // First-to-Expire sorting: 50 (past), 50 (future), 100 (null).
      // 35 debits apply to 50 (past), leaving 15 unused.
      // 15 unused past credit will expire.
      // Expected Final Balance = 200 (Total Granted) - 35 (Usage) - 15 (Expired) = 150.

      // Run expire job
      const res = await authedRequest(app)
        .post('/api/v1/credits/jobs/expire-bundles')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.processedUsers).toBeGreaterThanOrEqual(1);

      // Verify the remaining balance
      const balRes = await authedRequest(app)
        .get('/api/v1/credits/balance')
        .set('authorization', `Bearer ${validJwt}`);

      expect(balRes.body.balance).toBe(150);
    });
  });
});

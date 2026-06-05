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
  });
});

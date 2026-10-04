import { INestApplication } from '@nestjs/common';
import { CreditSource, CurrencyCode, IdentityType } from '@prisma/client';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AdminModule } from '@modules/admin/admin.module';

import {
  buildAdminAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import {
  cleanupTestSubscriptionPlans,
  cleanupTestUsers,
} from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('AdminModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: IdentityCryptoService;
  let adminAuthHeader: string;

  const allCreatedUserIds: string[] = [];
  const allCreatedPlanIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([AdminModule]);
    app = context.app;
    prisma = context.prisma;
    crypto = app.get(IdentityCryptoService);

    adminAuthHeader = buildAdminAuthHeader();
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await cleanupTestSubscriptionPlans(prisma, allCreatedPlanIds);
    await app.close();
  });

  describe('Admin Authentication Guard', () => {
    it('rejects requests without Bearer token (401)', async () => {
      // Arrange & Act
      const res = await authedRequest(app).get(
        '/api/v1/admin/subscriptions/plans',
      );

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid Bearer token (401)', async () => {
      // Arrange
      const wrongAuth = buildAdminAuthHeader('bad-token');

      // Act
      const res = await authedRequest(app)
        .get('/api/v1/admin/subscriptions/plans')
        .set('authorization', wrongAuth);

      // Assert
      expect(res.status).toBe(401);
    });
  });

  describe('Admin User Account Operations (AdminController)', () => {
    let targetUserId: string;

    beforeEach(async () => {
      // Arrange
      const user = await prisma.user.create({ data: {} });
      targetUserId = user.id;
      allCreatedUserIds.push(user.id);
    });

    it('DELETE /api/v1/admin/users/:userId - soft deletes user account (204)', async () => {
      // Act
      const res = await authedRequest(app)
        .delete(`/api/v1/admin/users/${targetUserId}`)
        .set('authorization', adminAuthHeader)
        .send({ reason: 'Terms of service violation' });

      // Assert
      expect(res.status).toBe(204);

      const deletedUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      expect(deletedUser?.deletedAt).not.toBeNull();
    });

    it('DELETE /api/v1/admin/users/:userId - returns 404 for non-existent user', async () => {
      // Act
      const res = await authedRequest(app)
        .delete('/api/v1/admin/users/non-existent-user-id')
        .set('authorization', adminAuthHeader)
        .send({ reason: 'Random cleanup' });

      // Assert
      expect(res.status).toBe(404);
    });

    it('DELETE /api/v1/admin/users/:userId - rejects missing reason in payload (400)', async () => {
      // Act
      const res = await authedRequest(app)
        .delete(`/api/v1/admin/users/${targetUserId}`)
        .set('authorization', adminAuthHeader)
        .send({});

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('Admin Credit Management (AdminController)', () => {
    let creditUserId: string;

    beforeAll(async () => {
      // Arrange
      const user = await prisma.user.create({ data: {} });
      creditUserId = user.id;
      allCreatedUserIds.push(user.id);
    });

    it('POST /api/v1/admin/credits/grant - grants credits with valid payload and timezone', async () => {
      // Arrange & Act
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/grant')
        .set('authorization', adminAuthHeader)
        .set('x-timezone', 'UTC')
        .send({
          userId: creditUserId,
          amount: 50,
          source: CreditSource.PURCHASE,
          referenceId: 'admin-grant-001',
        });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(50);
      expect(res.body.source).toBe(CreditSource.PURCHASE);
      expect(res.body.userId).toBe(creditUserId);
    });

    it('POST /api/v1/admin/credits/grant - rejects when x-timezone is missing (400)', async () => {
      // Arrange & Act
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/grant')
        .set('authorization', adminAuthHeader)
        .set('x-timezone', '')
        .send({
          userId: creditUserId,
          amount: 50,
          source: CreditSource.PURCHASE,
        });

      // Assert
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/admin/credits/consume - consumes granted credits', async () => {
      // Arrange & Act
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/consume')
        .set('authorization', adminAuthHeader)
        .send({
          userId: creditUserId,
          amount: 20,
          referenceId: 'admin-debit-001',
        });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(20);
    });

    it('POST /api/v1/admin/credits/consume - rejects on insufficient balance (402 Payment Required)', async () => {
      // Arrange & Act
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/consume')
        .set('authorization', adminAuthHeader)
        .send({
          userId: creditUserId,
          amount: 99999,
          referenceId: 'admin-debit-overflow',
        });

      // Assert
      expect(res.status).toBe(402);
    });

    it('POST /api/v1/admin/credits/grant - rejects invalid payload (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/credits/grant')
        .set('authorization', adminAuthHeader)
        .set('x-timezone', 'UTC')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Admin Subscriptions Management (SubscriptionsAdminController)', () => {
    let createdPlanId: string;
    let createdPriceId: string;

    it('POST /api/v1/admin/subscriptions/plans - creates a new subscription plan (201)', async () => {
      // Arrange
      const planSlug = `e2e-plan-${Date.now()}`;
      const payload = {
        name: 'E2E Test Premium Plan',
        slug: planSlug,
        description: 'Test subscription plan for E2E validation',
        creditsGranted: 100,
        validityDays: 30,
        trialDurationDays: 0,
        sortOrder: 1,
      };

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/admin/subscriptions/plans')
        .set('authorization', adminAuthHeader)
        .send(payload);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(payload.name);
      expect(res.body.slug).toBe(payload.slug);
      expect(res.body.creditsGranted).toBe(100);
      expect(res.body.validityDays).toBe(30);

      createdPlanId = res.body.id;
      allCreatedPlanIds.push(createdPlanId);
    });

    it('GET /api/v1/admin/subscriptions/plans - retrieves all subscription plans (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/admin/subscriptions/plans')
        .set('authorization', adminAuthHeader);

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const plan = res.body.find((p: any) => p.id === createdPlanId);
      expect(plan).toBeDefined();
    });

    it('PATCH /api/v1/admin/subscriptions/plans/:id - updates plan details (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .patch(`/api/v1/admin/subscriptions/plans/${createdPlanId}`)
        .set('authorization', adminAuthHeader)
        .send({
          name: 'Updated E2E Test Plan',
          creditsGranted: 150,
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated E2E Test Plan');
      expect(res.body.creditsGranted).toBe(150);
    });

    it('PATCH /api/v1/admin/subscriptions/plans/:id - returns 404 for unknown plan', async () => {
      // Act
      const res = await authedRequest(app)
        .patch(
          '/api/v1/admin/subscriptions/plans/00000000-0000-0000-0000-000000000000',
        )
        .set('authorization', adminAuthHeader)
        .send({ name: 'Will not update' });

      // Assert
      expect(res.status).toBe(404);
    });

    it('POST /api/v1/admin/subscriptions/plans/:planId/prices - adds a localized price (201)', async () => {
      // Arrange
      const pricePayload = {
        currencyCode: CurrencyCode.USD,
        price: 19.99,
        countryCode: 'US',
      };

      // Act
      const res = await authedRequest(app)
        .post(`/api/v1/admin/subscriptions/plans/${createdPlanId}/prices`)
        .set('authorization', adminAuthHeader)
        .send(pricePayload);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.currencyCode).toBe(CurrencyCode.USD);
      expect(res.body.countryCode).toBe('US');

      createdPriceId = res.body.id;
    });

    it('POST /api/v1/admin/subscriptions/plans/:planId/prices - returns 404 for unknown plan', async () => {
      // Act
      const res = await authedRequest(app)
        .post(
          '/api/v1/admin/subscriptions/plans/00000000-0000-0000-0000-000000000000/prices',
        )
        .set('authorization', adminAuthHeader)
        .send({
          currencyCode: CurrencyCode.USD,
          price: 9.99,
          countryCode: 'US',
        });

      // Assert
      expect(res.status).toBe(404);
    });

    it('DELETE /api/v1/admin/subscriptions/plans/:planId/prices/:priceId - removes localized price (204)', async () => {
      // Act
      const res = await authedRequest(app)
        .delete(
          `/api/v1/admin/subscriptions/plans/${createdPlanId}/prices/${createdPriceId}`,
        )
        .set('authorization', adminAuthHeader);

      // Assert
      expect(res.status).toBe(204);
    });

    it('DELETE /api/v1/admin/subscriptions/plans/:planId/prices/:priceId - returns 404 for unknown price', async () => {
      // Act
      const res = await authedRequest(app)
        .delete(
          `/api/v1/admin/subscriptions/plans/${createdPlanId}/prices/00000000-0000-0000-0000-000000000000`,
        )
        .set('authorization', adminAuthHeader);

      // Assert
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/v1/admin/dev-login
  // =========================================================================
  describe('POST /api/v1/admin/dev-login', () => {
    const identifier = 'admindevlogin@e2e.test';
    let seededUserId: string;

    beforeAll(async () => {
      const { publicValueHash: hash } = await crypto.processPublicValue(
        identifier,
        IdentityType.EMAIL,
      );
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'EMAIL',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: 'a••••n@e2e.test',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'EMAIL',
          valueHash: hash,
          valueMasked: 'a••••n@e2e.test',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);
    });

    it('200 – returns access token for known dev identifier', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/dev-login')
        .set('authorization', adminAuthHeader)
        .send({ identifier });

      expect(res.status).toBe(200);
      expect(res.body.accessToken || res.body.access_token).toBeDefined();
      expect(res.body.userId || res.body.user_id).toBe(seededUserId);
    });

    it('404 – not found for unknown identifier', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/dev-login')
        .set('authorization', adminAuthHeader)
        .send({ identifier: 'ghost@e2e.test' });

      expect(res.status).toBe(404);
    });

    it('401 – missing Admin Auth header', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/dev-login')
        .send({ identifier });

      expect(res.status).toBe(401);
    });

    it('401 – wrong credentials in Admin Auth header', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/dev-login')
        .set('authorization', buildAdminAuthHeader('wrong-token'))
        .send({ identifier });

      expect(res.status).toBe(401);
    });
  });
});

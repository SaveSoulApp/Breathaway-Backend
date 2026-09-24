import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CurrencyCode,
  StorePlatform,
  SubscriptionStatus,
} from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import {
  cleanupTestSubscriptionPlans,
  cleanupTestUsers,
} from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('SubscriptionsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  const allCreatedPlanIds: string[] = [];

  let testUserId: string;
  let testUserJwt: string;
  let seededPlanId: string;
  const storeProductId = 'com.breathaway.plan.monthly.test';

  beforeAll(async () => {
    const context = await createAuthTestApp([SubscriptionsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    // Seed test user
    const user = await prisma.user.create({ data: {} });
    testUserId = user.id;
    allCreatedUserIds.push(user.id);

    testUserJwt = jwtService.sign({
      sub: user.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    // Seed test subscription plan
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'E2E Gold Plan',
        slug: `e2e-gold-${Date.now()}`,
        description: 'Gold tier subscription for E2E testing',
        appleProductId: storeProductId,
        creditsGranted: 200,
        validityDays: 30,
        status: 'ACTIVE',
      },
    });
    seededPlanId = plan.id;
    allCreatedPlanIds.push(plan.id);

    // Seed default localized prices so regional queries and fallback lookups match
    await prisma.subscriptionPlanPrice.create({
      data: {
        planId: plan.id,
        currencyCode: CurrencyCode.INR,
        price: 799,
        countryCode: 'IN',
      },
    });
    await prisma.subscriptionPlanPrice.create({
      data: {
        planId: plan.id,
        currencyCode: CurrencyCode.USD,
        price: 9.99,
        countryCode: 'US',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await cleanupTestSubscriptionPlans(prisma, allCreatedPlanIds);
    await app.close();
  });

  describe('GET /api/v1/subscriptions/plans (Public & Localized)', () => {
    it('returns active plans without authentication (200)', async () => {
      // Act
      const res = await authedRequest(app).get('/api/v1/subscriptions/plans');

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((p: any) => p.id === seededPlanId);
      expect(found).toBeDefined();
    });

    it('returns active plans with countryCode query filter (200)', async () => {
      // Act
      const res = await authedRequest(app).get(
        '/api/v1/subscriptions/plans?countryCode=US',
      );

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns active plans with authenticated user JWT (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/subscriptions/plans')
        .set('authorization', `Bearer ${testUserJwt}`);

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/subscriptions/plans/:id', () => {
    it('returns a single plan by ID (200)', async () => {
      // Act
      const res = await authedRequest(app).get(
        `/api/v1/subscriptions/plans/${seededPlanId}`,
      );

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(seededPlanId);
      expect(res.body.name).toBe('E2E Gold Plan');
      expect(res.body.creditsGranted).toBe(200);
    });

    it('returns 404 for non-existent plan ID', async () => {
      // Act
      const res = await authedRequest(app).get(
        '/api/v1/subscriptions/plans/00000000-0000-0000-0000-000000000000',
      );

      // Assert
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/subscriptions/me', () => {
    it('rejects unauthenticated requests (401)', async () => {
      // Act
      const res = await authedRequest(app).get('/api/v1/subscriptions/me');

      // Assert
      expect(res.status).toBe(401);
    });

    it('returns 404 when user has no active subscription', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/subscriptions/me')
        .set('authorization', `Bearer ${testUserJwt}`);

      // Assert
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/subscriptions/verify-purchase', () => {
    const purchaseToken = `token_${Date.now()}`;

    it('rejects unauthenticated requests (401)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .send({
          storePlatform: StorePlatform.APPLE,
          purchaseToken: 'unauth-token',
          productId: storeProductId,
        });

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects invalid payload missing required fields (400)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({});

      // Assert
      expect(res.status).toBe(400);
    });

    it('verifies purchase, provisions subscription, and returns active record (200)', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          purchaseToken,
          productId: storeProductId,
          purchaseDate: now.toISOString(),
          expiresDate: nextMonth.toISOString(),
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SubscriptionStatus.ACTIVE);
      expect(res.body.storePlatform).toBe(StorePlatform.APPLE);
      expect(res.body.storeTransactionId).toBe(purchaseToken);
    });

    it('is idempotent: returns existing subscription when purchaseToken is already processed (200)', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          purchaseToken,
          productId: storeProductId,
          purchaseDate: now.toISOString(),
          expiresDate: nextMonth.toISOString(),
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.storeTransactionId).toBe(purchaseToken);
    });

    it('returns the active subscription now that one is provisioned via GET /me (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/subscriptions/me')
        .set('authorization', `Bearer ${testUserJwt}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SubscriptionStatus.ACTIVE);
      expect(res.body.storeTransactionId).toBe(purchaseToken);
    });

    it('rejects verify-purchase when expiration precedes purchase date (400 InvalidSubscriptionDatesException)', async () => {
      // Arrange
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          purchaseToken: `inv_token_${Date.now()}`,
          productId: storeProductId,
          purchaseDate: now.toISOString(),
          expiresDate: yesterday.toISOString(),
        });

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects verify-purchase when productId is not recognized in system (404)', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          purchaseToken: `unrec_token_${Date.now()}`,
          productId: 'com.nonexistent.plan',
          purchaseDate: now.toISOString(),
          expiresDate: nextMonth.toISOString(),
        });

      // Assert
      expect(res.status).toBe(404);
    });

    it('returns subscription history with pagination via GET /me/history (200)', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/subscriptions/me/history?page=1&limit=10')
        .set('authorization', `Bearer ${testUserJwt}`);

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects GET /me/history when unauthenticated (401)', async () => {
      // Act
      const res = await authedRequest(app).get(
        '/api/v1/subscriptions/me/history',
      );

      // Assert
      expect(res.status).toBe(401);
    });
  });
});

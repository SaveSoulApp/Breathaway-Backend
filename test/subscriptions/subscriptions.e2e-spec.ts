import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CurrencyCode,
  StorePlatform,
  SubscriptionStatus,
} from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { AppleSubscriptionService } from '@modules/subscriptions/services/apple-subscription.service';
import { GoogleSubscriptionService } from '@modules/subscriptions/services/google-subscription.service';
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
  let appleService: AppleSubscriptionService;
  let googleService: GoogleSubscriptionService;

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
    appleService = app.get(AppleSubscriptionService);
    googleService = app.get(GoogleSubscriptionService);

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
        googleProductId: storeProductId,
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
        originalPrice: 799,
        countryCode: 'IN',
      },
    });
    await prisma.subscriptionPlanPrice.create({
      data: {
        planId: plan.id,
        currencyCode: CurrencyCode.USD,
        originalPrice: 9.99,
        countryCode: 'US',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await cleanupTestSubscriptionPlans(prisma, allCreatedPlanIds);
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    const mockSignedJws = 'valid.storekit2.jws.token';

    it('rejects unauthenticated requests (401)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: 'unauth-token',
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

    it('rejects Apple verification when signedTransactionInfo is missing (401)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          productId: storeProductId,
        });

      // Assert
      expect(res.status).toBe(401);
    });

    it('verifies purchase with StoreKit 2 JWS, provisions subscription, and returns active record (200)', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      jest.spyOn(appleService, 'verifyAndDecodeTransaction').mockReturnValue({
        originalTransactionId: purchaseToken,
        transactionId: purchaseToken,
        productId: storeProductId,
        purchaseDate: now.getTime(),
        expiresDate: nextMonth.getTime(),
        currency: 'USD',
        price: 999,
        bundleId: 'com.breathaway.app',
        environment: 'Production',
      });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: mockSignedJws,
          productId: storeProductId,
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

      jest.spyOn(appleService, 'verifyAndDecodeTransaction').mockReturnValue({
        originalTransactionId: purchaseToken,
        transactionId: purchaseToken,
        productId: storeProductId,
        purchaseDate: now.getTime(),
        expiresDate: nextMonth.getTime(),
        currency: 'USD',
        price: 999,
        bundleId: 'com.breathaway.app',
        environment: 'Production',
      });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: mockSignedJws,
          productId: storeProductId,
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.storeTransactionId).toBe(purchaseToken);
    });

    it('rejects verify-purchase when transaction is already claimed by another user (409 Conflict)', async () => {
      // Arrange
      const otherUser = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(otherUser.id);
      const otherUserJwt = jwtService.sign({
        sub: otherUser.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      jest
        .spyOn(appleService, 'verifyAndDecodeTransaction')
        .mockReturnValueOnce({
          originalTransactionId: purchaseToken,
          transactionId: purchaseToken,
          productId: storeProductId,
          purchaseDate: now.getTime(),
          expiresDate: nextMonth.getTime(),
          currency: 'USD',
          price: 999,
          bundleId: 'com.breathaway.app',
          environment: 'Production',
        });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${otherUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: mockSignedJws,
          productId: storeProductId,
        });

      // Assert
      expect(res.status).toBe(409);
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

      jest
        .spyOn(appleService, 'verifyAndDecodeTransaction')
        .mockReturnValueOnce({
          originalTransactionId: `inv_token_${Date.now()}`,
          transactionId: `inv_token_${Date.now()}`,
          productId: storeProductId,
          purchaseDate: now.getTime(),
          expiresDate: yesterday.getTime(),
          currency: 'USD',
          price: 999,
          bundleId: 'com.breathaway.app',
          environment: 'Production',
        });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: 'inv-dates-jws',
          productId: storeProductId,
        });

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects verify-purchase when productId is not recognized in system (404)', async () => {
      // Arrange
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      jest
        .spyOn(appleService, 'verifyAndDecodeTransaction')
        .mockReturnValueOnce({
          originalTransactionId: `unrec_token_${Date.now()}`,
          transactionId: `unrec_token_${Date.now()}`,
          productId: 'com.nonexistent.plan',
          purchaseDate: now.getTime(),
          expiresDate: nextMonth.getTime(),
          currency: 'USD',
          price: 999,
          bundleId: 'com.breathaway.app',
          environment: 'Production',
        });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.APPLE,
          signedTransactionInfo: 'unrec-jws',
          productId: 'com.nonexistent.plan',
        });

      // Assert
      expect(res.status).toBe(404);
    });

    it('verifies Google Play purchase via Developer API, provisions subscription, and returns active record (200)', async () => {
      // Arrange
      const googleTxToken = `google_token_${Date.now()}`;
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      jest.spyOn(googleService, 'verifyPurchase').mockResolvedValueOnce({
        kind: 'androidpublisher#subscriptionPurchaseV2',
        startTime: now.toISOString(),
        expiryTime: nextMonth.toISOString(),
        autoRenewing: true,
        priceCurrencyCode: 'USD',
        priceAmountMicros: '9990000',
        countryCode: 'US',
        acknowledgementState: 1,
      });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/verify-purchase')
        .set('authorization', `Bearer ${testUserJwt}`)
        .send({
          storePlatform: StorePlatform.GOOGLE,
          purchaseToken: googleTxToken,
          productId: storeProductId,
          packageName: 'com.breathaway.app',
        });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SubscriptionStatus.ACTIVE);
      expect(res.body.storePlatform).toBe(StorePlatform.GOOGLE);
      expect(res.body.storeTransactionId).toBe(googleTxToken);
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

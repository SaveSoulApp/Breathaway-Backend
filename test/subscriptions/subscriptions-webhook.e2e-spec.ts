import { INestApplication } from '@nestjs/common';
import { CurrencyCode, SubscriptionEventType } from '@prisma/client';

import { AppleSubscriptionService } from '@modules/subscriptions/services/apple-subscription.service';
import { GoogleSubscriptionService } from '@modules/subscriptions/services/google-subscription.service';
import { SubscriptionsService } from '@modules/subscriptions/services/subscriptions.service';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { authedRequest } from '../helpers/request.helper';

describe('SubscriptionsWebhookController (e2e)', () => {
  let app: INestApplication;
  let appleService: AppleSubscriptionService;
  let googleService: GoogleSubscriptionService;
  let subscriptionsService: SubscriptionsService;

  beforeAll(async () => {
    const context = await createAuthTestApp([SubscriptionsModule]);
    app = context.app;
    appleService = app.get(AppleSubscriptionService);
    googleService = app.get(GoogleSubscriptionService);
    subscriptionsService = app.get(SubscriptionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/subscriptions/webhooks/apple', () => {
    it('rejects payload missing signedPayload with 400 Bad Request', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/apple')
        .send({});

      expect(res.status).toBe(400);
    });

    it('processes Apple notification and returns 200 { status: "ok" }', async () => {
      const now = Date.now();
      const nextMonth = now + 30 * 24 * 60 * 60 * 1000;

      jest.spyOn(appleService, 'parseNotification').mockReturnValueOnce({
        notificationType: 'DID_RENEW',
        subtype: undefined,
        transactionInfo: {
          originalTransactionId: 'orig_apple_txn_001',
          transactionId: 'apple_txn_001',
          productId: 'com.breathaway.plan.monthly',
          purchaseDate: now,
          expiresDate: nextMonth,
          currency: 'USD',
          price: 19990,
          storefront: 'USA',
        },
        renewalInfo: {
          autoRenewProductId: 'com.breathaway.plan.monthly',
          autoRenewStatus: 1,
        },
        rawPayload: { type: 'DID_RENEW' },
      });

      jest
        .spyOn(appleService, 'mapNotificationType')
        .mockReturnValueOnce(SubscriptionEventType.RENEWAL);

      jest
        .spyOn(subscriptionsService, 'handleRenewal')
        .mockResolvedValueOnce(undefined as never);

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/apple')
        .send({ signedPayload: 'valid.mocked.jws.payload' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(subscriptionsService.handleRenewal).toHaveBeenCalledWith(
        expect.objectContaining({
          storeTransactionId: 'orig_apple_txn_001',
        }),
      );
    });

    it('handles processing errors gracefully and returns 200 { status: "error" } to satisfy Apple retry policy', async () => {
      jest
        .spyOn(appleService, 'parseNotification')
        .mockImplementationOnce(() => {
          throw new Error('Malformed Apple JWS token');
        });

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/apple')
        .send({ signedPayload: 'corrupt.jws.payload' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'error' });
    });
  });

  describe('POST /api/v1/subscriptions/webhooks/google', () => {
    it('rejects payload missing required message and subscription fields with 400', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/google')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 200 { status: "ignored" } when Google notification contains no subscription data', async () => {
      jest.spyOn(googleService, 'parseNotification').mockReturnValueOnce({
        packageName: 'com.breathaway.app',
        eventTimeMillis: Date.now().toString(),
        subscriptionNotification: undefined as never,
      });

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/google')
        .send({
          message: {
            data: Buffer.from('non-sub-data').toString('base64'),
            messageId: 'google-msg-001',
          },
          subscription: 'projects/test/subscriptions/google-rtdn',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ignored' });
    });

    it('returns 200 { status: "verification_failed" } when Google Play Developer API purchase check fails', async () => {
      jest.spyOn(googleService, 'parseNotification').mockReturnValueOnce({
        packageName: 'com.breathaway.app',
        eventTimeMillis: Date.now().toString(),
        subscriptionNotification: {
          version: '1.0',
          notificationType: 2,
          purchaseToken: 'failed_token_123',
          subscriptionId: 'plan_monthly',
        },
      });

      jest
        .spyOn(googleService, 'mapNotificationType')
        .mockReturnValueOnce(SubscriptionEventType.RENEWAL);

      jest
        .spyOn(googleService, 'verifyPurchase')
        .mockRejectedValueOnce(new Error('Google API 404 Token Not Found'));

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/google')
        .send({
          message: {
            data: Buffer.from('token-data').toString('base64'),
            messageId: 'google-msg-002',
          },
          subscription: 'projects/test/subscriptions/google-rtdn',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'verification_failed' });
    });

    it('processes verified Google subscription notification and returns 200 { status: "ok" }', async () => {
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      jest.spyOn(googleService, 'parseNotification').mockReturnValueOnce({
        packageName: 'com.breathaway.app',
        eventTimeMillis: Date.now().toString(),
        subscriptionNotification: {
          version: '1.0',
          notificationType: 2,
          purchaseToken: 'valid_google_token_456',
          subscriptionId: 'com.breathaway.plan.monthly',
        },
      });

      jest
        .spyOn(googleService, 'mapNotificationType')
        .mockReturnValueOnce(SubscriptionEventType.RENEWAL);

      jest.spyOn(googleService, 'verifyPurchase').mockResolvedValueOnce({
        kind: 'androidpublisher#subscriptionPurchase',
        startTime: now.toISOString(),
        expiryTime: nextMonth.toISOString(),
        autoRenewing: true,
        priceCurrencyCode: 'USD',
        priceAmountMicros: '19990000',
        countryCode: 'US',
      });

      jest
        .spyOn(subscriptionsService, 'handleRenewal')
        .mockResolvedValueOnce(undefined as never);

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/google')
        .send({
          message: {
            data: Buffer.from('valid-data').toString('base64'),
            messageId: 'google-msg-003',
          },
          subscription: 'projects/test/subscriptions/google-rtdn',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(subscriptionsService.handleRenewal).toHaveBeenCalledWith(
        expect.objectContaining({
          storeTransactionId: 'valid_google_token_456',
        }),
      );
    });

    it('returns 200 { status: "error" } when an unexpected exception is thrown during Google handling', async () => {
      jest
        .spyOn(googleService, 'parseNotification')
        .mockImplementationOnce(() => {
          throw new Error('Unexpected JSON corrupt stream');
        });

      const res = await authedRequest(app)
        .post('/api/v1/subscriptions/webhooks/google')
        .send({
          message: {
            data: 'invalid-base64',
            messageId: 'google-msg-004',
          },
          subscription: 'projects/test/subscriptions/google-rtdn',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'error' });
    });
  });
});

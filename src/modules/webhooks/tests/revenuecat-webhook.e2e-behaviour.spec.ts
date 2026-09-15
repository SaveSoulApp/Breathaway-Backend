import { createHmac } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { LoggerService } from '@core/logger';
import { AppValidationPipe } from '@core/pipes';

import { RevenueCatWebhookGuard } from '../guards/revenuecat-webhook.guard';
import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';

/**
 * Guards the properties this endpoint cannot afford to lose:
 * 1. It must reject unauthenticated requests lacking valid HMAC-SHA256 signature (401 Unauthorized).
 * 2. It must accept payload fields the DTO does not declare without failing validation (HTTP 200).
 */
describe('RevenueCat webhook behaviour (e2e)', () => {
  let app: INestApplication;
  const webhookSecret = 'test_rc_webhook_signing_secret_123';

  let webhooksService: {
    parseRevenueCatWebhook: jest.Mock;
    handlePurchaseEvent: jest.Mock;
  };

  const createSignatureHeader = (
    timestamp: number,
    payload: string,
    secret: string = webhookSecret,
  ): string => {
    const signedPayload = `${timestamp}.${payload}`;
    const sig = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    return `t=${timestamp},v1=${sig}`;
  };

  beforeEach(async () => {
    webhooksService = {
      parseRevenueCatWebhook: jest.fn().mockReturnValue({
        gateway: 'REVENUECAT',
        providerEventType: 'NON_RENEWING_PURCHASE',
        gatewayTransactionId: 'txn_1',
        productId: 'likes_10',
        environment: 'SANDBOX',
      }),
      handlePurchaseEvent: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: webhooksService },
        RevenueCatWebhookGuard,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'REVENUECAT_WEBHOOK_SECRET') return webhookSecret;
              throw new Error(`Missing config: ${key}`);
            }),
            get: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            forContext: jest.fn().mockReturnValue({
              log: jest.fn(),
              warn: jest.fn(),
              error: jest.fn(),
              debug: jest.fn(),
            }),
          },
        },
        {
          provide: APP_PIPE,
          useValue: new AppValidationPipe(),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('rejects an unauthenticated request lacking HMAC signature with 401', async () => {
    // Arrange & Act
    const response = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .send({
        api_version: '1.0',
        event: {
          type: 'NON_RENEWING_PURCHASE',
          id: 'evt_unauth',
        },
      });

    // Assert
    expect(response.status).toBe(401);
  });

  it('accepts a payload carrying fields the DTO does not declare when HMAC is valid', async () => {
    // Arrange
    const payload = {
      api_version: '1.0',
      event: {
        type: 'NON_RENEWING_PURCHASE',
        id: 'evt_1',
        transaction_id: 'txn_1',
        product_id: 'likes_10',
        // Present on real purchases, absent from the DTO and the test event.
        discount_percentage: null,
        discount_amount: null,
        discount_identifier: null,
        // Stand-in for whatever RevenueCat adds next.
        some_future_field: { nested: true },
      },
    };
    const rawPayload = JSON.stringify(payload);
    const nowSec = Math.floor(Date.now() / 1000);
    const signature = createSignatureHeader(nowSec, rawPayload);

    // Act
    await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .set('x-revenuecat-webhook-signature', signature)
      .send(payload)
      .expect(200)
      .expect({ status: 'ok' });

    // Assert
    expect(webhooksService.handlePurchaseEvent).toHaveBeenCalled();
  });

  it('answers 200 rather than an error status for test events with valid HMAC', async () => {
    // Arrange
    const payload = { event: { type: 'TEST', id: 'evt_2' } };
    const rawPayload = JSON.stringify(payload);
    const nowSec = Math.floor(Date.now() / 1000);
    const signature = createSignatureHeader(nowSec, rawPayload);

    // Act
    const response = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .set('x-revenuecat-webhook-signature', signature)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
  });
});

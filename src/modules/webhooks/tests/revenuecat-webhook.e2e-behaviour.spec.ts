import { LoggerService } from '@core/logger';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';

/**
 * Guards the one property this endpoint cannot afford to lose: it must accept
 * payload fields it has never seen.
 *
 * RevenueCat adds fields over time — real purchases already carry `discount_*`
 * fields absent from the dashboard's test event — and the application-wide
 * validation pipe runs with `forbidNonWhitelisted: true`. If that reached this
 * route, the next field RevenueCat introduces would turn every delivery into a
 * 400 and RevenueCat would retry against the same wall until events expired.
 *
 * The app-level pipe is reproduced here exactly as `AppModule` configures it, so
 * this test fails if either that config or the route's override drifts.
 */
describe('RevenueCat webhook payload tolerance', () => {
  let app: INestApplication;
  let webhooksService: {
    parseRevenueCatWebhook: jest.Mock;
    handlePurchaseEvent: jest.Mock;
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
          useValue: new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
          }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('accepts a payload carrying fields the DTO does not declare', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .send({
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
      })
      .expect(200)
      .expect({ status: 'ok' });

    expect(webhooksService.handlePurchaseEvent).toHaveBeenCalled();
  });

  it('answers 200 rather than an error status', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .send({ event: { type: 'TEST', id: 'evt_2' } });

    expect(response.status).toBe(200);
  });
});

import { createHmac, randomBytes } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CurrencyCode,
  PaymentGateway,
  PaymentOrderStatus,
} from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { RazorpayGateway } from '@modules/payments/gateways/razorpay/razorpay.gateway';
import { PaymentsModule } from '@modules/payments/payments.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import {
  cleanupTestPaymentRoutes,
  cleanupTestSubscriptionPlans,
  cleanupTestUsers,
} from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  const allCreatedPlanIds: string[] = [];
  const allCreatedRouteIds: string[] = [];

  let user1Id: string;
  let user1Jwt: string;
  let user2Id: string;
  let user2Jwt: string;

  let seededPlanId: string;
  let razorpaySecret: string;

  beforeAll(async () => {
    // Mock external Razorpay order creation API call
    jest
      .spyOn(RazorpayGateway.prototype, 'createOrder')
      .mockImplementation(async (params) => {
        const fakeOrderId = `order_${randomBytes(8).toString('hex')}`;
        return {
          gatewayOrderId: fakeOrderId,
          gatewayCreatedAt: new Date(),
          action: {
            type: 'sdk',
            keyId: 'rzp_test_mock_key_id',
            gatewayOrderId: fakeOrderId,
            prefill: {
              contact: params.userContact,
              name: params.userName,
            },
          },
        };
      });

    const context = await createAuthTestApp([PaymentsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    razorpaySecret =
      configService.get<string>('RAZORPAY_KEY_SECRET') ||
      'rzp_test_mock_key_secret';

    // Seed test users
    const user1 = await prisma.user.create({ data: {} });
    user1Id = user1.id;
    allCreatedUserIds.push(user1.id);
    user1Jwt = jwtService.sign({
      sub: user1.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    const user2 = await prisma.user.create({ data: {} });
    user2Id = user2.id;
    allCreatedUserIds.push(user2.id);
    user2Jwt = jwtService.sign({
      sub: user2.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });

    // Seed test subscription plan
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'E2E Payment Credits Plan',
        slug: `e2e-pay-${Date.now()}`,
        description: 'Test credits plan for payment tests',
        creditsGranted: 50,
        validityDays: 30,
        status: 'ACTIVE',
      },
    });
    seededPlanId = plan.id;
    allCreatedPlanIds.push(plan.id);

    // Seed localized price for default country 'IN'
    await prisma.subscriptionPlanPrice.create({
      data: {
        planId: plan.id,
        countryCode: 'IN',
        currencyCode: CurrencyCode.INR,
        originalPrice: 499,
      },
    });

    // Seed active payment gateway route for 'IN' -> RAZORPAY
    const route = await prisma.paymentGatewayRoute.upsert({
      where: {
        countryCode_gateway: {
          countryCode: 'IN',
          gateway: PaymentGateway.RAZORPAY,
        },
      },
      update: {
        enabled: true,
        priority: 1,
      },
      create: {
        countryCode: 'IN',
        gateway: PaymentGateway.RAZORPAY,
        priority: 1,
        enabled: true,
      },
    });
    allCreatedRouteIds.push(route.id);
  });

  afterAll(async () => {
    await cleanupTestPaymentRoutes(prisma, allCreatedRouteIds);
    await cleanupTestSubscriptionPlans(prisma, allCreatedPlanIds);
    await cleanupTestUsers(prisma, allCreatedUserIds);
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/payments/orders', () => {
    it('rejects unauthenticated requests (401)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/payments/orders')
        .send({ planId: seededPlanId });

      expect(res.status).toBe(401);
    });

    it('rejects requests for non-existent subscription plan (404)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/payments/orders')
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({ planId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
    });

    it('creates a payment order with derived price and returns checkout action (201)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/payments/orders')
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({ planId: seededPlanId });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('orderId');
      expect(res.body).toHaveProperty('amount', 49900); // 499 INR in paise
      expect(res.body).toHaveProperty('currency', 'INR');
      expect(res.body).toHaveProperty('provider', PaymentGateway.RAZORPAY);
      expect(res.body).toHaveProperty('status', PaymentOrderStatus.PENDING);
      expect(res.body).toHaveProperty('action');
      expect(res.body.action).toHaveProperty('type', 'sdk');
      expect(res.body.action).toHaveProperty('gatewayOrderId');

      // Verify order exists in the database
      const order = await prisma.paymentOrder.findUnique({
        where: { id: res.body.orderId },
      });
      expect(order).toBeDefined();
      expect(order?.userId).toBe(user1Id);
      expect(order?.status).toBe(PaymentOrderStatus.PENDING);
    });
  });

  describe('GET /api/v1/payments/orders/:orderId', () => {
    let user1OrderId: string;

    beforeAll(async () => {
      const res = await authedRequest(app)
        .post('/api/v1/payments/orders')
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({ planId: seededPlanId });

      user1OrderId = res.body.orderId;
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await authedRequest(app).get(
        `/api/v1/payments/orders/${user1OrderId}`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent order ID', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/payments/orders/01J8VXYZ1234ABCDEFGHJKMNPQ')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when querying an order owned by another user', async () => {
      const res = await authedRequest(app)
        .get(`/api/v1/payments/orders/${user1OrderId}`)
        .set('authorization', `Bearer ${user2Jwt}`);

      expect(res.status).toBe(404);
    });

    it('returns current order status for owner (200)', async () => {
      const res = await authedRequest(app)
        .get(`/api/v1/payments/orders/${user1OrderId}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', PaymentOrderStatus.PENDING);
      expect(res.body.creditsGranted).toBeNull();
    });
  });

  describe('POST /api/v1/payments/orders/:orderId/verify', () => {
    let orderToVerifyId: string;
    let gatewayOrderId: string;

    beforeEach(async () => {
      const createRes = await authedRequest(app)
        .post('/api/v1/payments/orders')
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({ planId: seededPlanId });

      orderToVerifyId = createRes.body.orderId;
      gatewayOrderId = createRes.body.action.gatewayOrderId;
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await authedRequest(app)
        .post(`/api/v1/payments/orders/${orderToVerifyId}/verify`)
        .send({
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'fake_signature',
        });

      expect(res.status).toBe(401);
    });

    it('returns 404 for order owned by another user', async () => {
      const res = await authedRequest(app)
        .post(`/api/v1/payments/orders/${orderToVerifyId}/verify`)
        .set('authorization', `Bearer ${user2Jwt}`)
        .send({
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'fake_signature',
        });

      expect(res.status).toBe(404);
    });

    it('rejects verification with invalid HMAC signature (401)', async () => {
      const fakePaymentId = `pay_${randomBytes(8).toString('hex')}`;
      const wrongSignature = 'invalid_tampered_signature_hex_value';

      const res = await authedRequest(app)
        .post(`/api/v1/payments/orders/${orderToVerifyId}/verify`)
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: wrongSignature,
        });

      expect(res.status).toBe(401);
    });

    it('successfully verifies valid signature, marks order PAID, and grants credits (200)', async () => {
      const fakePaymentId = `pay_${randomBytes(8).toString('hex')}`;
      const validSignature = createHmac('sha256', razorpaySecret)
        .update(`${gatewayOrderId}|${fakePaymentId}`)
        .digest('hex');

      const res = await authedRequest(app)
        .post(`/api/v1/payments/orders/${orderToVerifyId}/verify`)
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', PaymentOrderStatus.PAID);
      expect(res.body).toHaveProperty('creditsGranted', 50);

      // Verify DB order record updated
      const updatedOrder = await prisma.paymentOrder.findUnique({
        where: { id: orderToVerifyId },
      });
      expect(updatedOrder?.status).toBe(PaymentOrderStatus.PAID);

      // Verify user credits balance increased
      const balanceRes = await authedRequest(app)
        .get('/api/v1/credits/balance')
        .set('authorization', `Bearer ${user1Jwt}`);
      expect(balanceRes.body.balance).toBeGreaterThanOrEqual(50);

      // Verify idempotency: calling verify again returns 200 without duplicate grants
      const secondVerifyRes = await authedRequest(app)
        .post(`/api/v1/payments/orders/${orderToVerifyId}/verify`)
        .set('authorization', `Bearer ${user1Jwt}`)
        .send({
          razorpay_order_id: gatewayOrderId,
          razorpay_payment_id: fakePaymentId,
          razorpay_signature: validSignature,
        });

      expect(secondVerifyRes.status).toBe(200);
      expect(secondVerifyRes.body.status).toBe(PaymentOrderStatus.PAID);
      expect(secondVerifyRes.body.creditsGranted).toBe(50);
    });
  });
});

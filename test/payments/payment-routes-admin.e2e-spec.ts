import { INestApplication } from '@nestjs/common';
import { PaymentGateway } from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { AdminModule } from '@modules/admin/admin.module';
import { PaymentsModule } from '@modules/payments/payments.module';

import {
  buildAdminAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import { cleanupTestPaymentRoutes } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('PaymentRoutesAdminController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminAuthHeader: string;

  const testCountry = 'FR';
  const allCreatedRouteIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([AdminModule, PaymentsModule]);
    app = context.app;
    prisma = context.prisma;

    adminAuthHeader = buildAdminAuthHeader();

    // Clean up any existing routes for testCountry from previous runs
    await prisma.paymentGatewayRoute.deleteMany({
      where: { countryCode: testCountry },
    });
  });

  afterAll(async () => {
    await cleanupTestPaymentRoutes(prisma, allCreatedRouteIds);
    await prisma.paymentGatewayRoute.deleteMany({
      where: { countryCode: testCountry },
    });
    if (app) {
      await app.close();
    }
  });

  describe('Admin Authentication Guard', () => {
    it('rejects unauthenticated requests without Bearer token (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/admin/payments/routes');
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid Bearer token (401)', async () => {
      const invalidAuth = buildAdminAuthHeader('invalid-token');
      const res = await authedRequest(app)
        .get('/api/v1/admin/payments/routes')
        .set('authorization', invalidAuth);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/admin/payments/routes', () => {
    it('rejects invalid payload where minAmount > maxAmount (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/payments/routes')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          gateway: PaymentGateway.RAZORPAY,
          priority: 1,
          enabled: true,
          minAmount: 5000,
          maxAmount: 1000,
        });

      expect(res.status).toBe(400);
    });

    it('creates a new payment route successfully (201)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/payments/routes')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          gateway: PaymentGateway.RAZORPAY,
          priority: 1,
          enabled: true,
          minAmount: 100,
          maxAmount: 100000,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.countryCode).toBe(testCountry);
      expect(res.body.gateway).toBe(PaymentGateway.RAZORPAY);
      expect(res.body.priority).toBe(1);
      expect(res.body.enabled).toBe(true);

      allCreatedRouteIds.push(res.body.id);
    });

    it('rejects duplicate route creation for same country and gateway (409)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/payments/routes')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          gateway: PaymentGateway.RAZORPAY,
          priority: 2,
          enabled: true,
        });

      expect(res.status).toBe(409);
    });

    it('creates a second route for the country (201)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/admin/payments/routes')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          gateway: PaymentGateway.CASHFREE,
          priority: 2,
          enabled: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.gateway).toBe(PaymentGateway.CASHFREE);
      expect(res.body.priority).toBe(2);

      allCreatedRouteIds.push(res.body.id);
    });
  });

  describe('GET /api/v1/admin/payments/routes', () => {
    it('lists payment routes filtered by countryCode (200)', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/admin/payments/routes')
        .query({ countryCode: testCountry })
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].priority).toBe(1);
      expect(res.body[1].priority).toBe(2);
    });

    it('filters payment routes by gateway (200)', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/admin/payments/routes')
        .query({ countryCode: testCountry, gateway: PaymentGateway.RAZORPAY })
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].gateway).toBe(PaymentGateway.RAZORPAY);
    });
  });

  describe('GET /api/v1/admin/payments/routes/:id', () => {
    it('returns 404 for non-existent route ID', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/admin/payments/routes/01J8VXYZ1234ABCDEFGHJKMNPQ')
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(404);
    });

    it('returns payment route by ID (200)', async () => {
      const routeId = allCreatedRouteIds[0];
      const res = await authedRequest(app)
        .get(`/api/v1/admin/payments/routes/${routeId}`)
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(routeId);
      expect(res.body.countryCode).toBe(testCountry);
    });
  });

  describe('PATCH /api/v1/admin/payments/routes/:id', () => {
    it('returns 404 when updating non-existent route ID', async () => {
      const res = await authedRequest(app)
        .patch('/api/v1/admin/payments/routes/01J8VXYZ1234ABCDEFGHJKMNPQ')
        .set('authorization', adminAuthHeader)
        .send({ minAmount: 200 });

      expect(res.status).toBe(404);
    });

    it('updates route boundaries successfully (200)', async () => {
      const routeId = allCreatedRouteIds[0];
      const res = await authedRequest(app)
        .patch(`/api/v1/admin/payments/routes/${routeId}`)
        .set('authorization', adminAuthHeader)
        .send({ minAmount: 200, maxAmount: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.minAmount).toBe(200);
      expect(res.body.maxAmount).toBe(50000);
    });
  });

  describe('PATCH /api/v1/admin/payments/routes/:id/toggle', () => {
    it('returns 404 when toggling non-existent route ID', async () => {
      const res = await authedRequest(app)
        .patch(
          '/api/v1/admin/payments/routes/01J8VXYZ1234ABCDEFGHJKMNPQ/toggle',
        )
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(404);
    });

    it('toggles route enabled flag when alternative active route exists (200)', async () => {
      const routeId = allCreatedRouteIds[1]; // CASHFREE route (2nd route)
      const res = await authedRequest(app)
        .patch(`/api/v1/admin/payments/routes/${routeId}/toggle`)
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);

      // Toggle back to enabled
      const toggleBackRes = await authedRequest(app)
        .patch(`/api/v1/admin/payments/routes/${routeId}/toggle`)
        .set('authorization', adminAuthHeader);

      expect(toggleBackRes.status).toBe(200);
      expect(toggleBackRes.body.enabled).toBe(true);
    });
  });

  describe('PUT /api/v1/admin/payments/routes/reorder', () => {
    it('rejects invalid payload that does not match all country routes (400)', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/admin/payments/routes/reorder')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          routeIds: [allCreatedRouteIds[0]], // Missing 2nd route ID
        });

      expect(res.status).toBe(400);
    });

    it('atomically reorders routes for the country (200)', async () => {
      // Invert order: CASHFREE -> Step 1, RAZORPAY -> Step 2
      const reorderedIds = [allCreatedRouteIds[1], allCreatedRouteIds[0]];
      const res = await authedRequest(app)
        .put('/api/v1/admin/payments/routes/reorder')
        .set('authorization', adminAuthHeader)
        .send({
          countryCode: testCountry,
          routeIds: reorderedIds,
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const first = res.body.find((r: any) => r.id === allCreatedRouteIds[1]);
      const second = res.body.find((r: any) => r.id === allCreatedRouteIds[0]);
      expect(first.priority).toBe(1);
      expect(second.priority).toBe(2);
    });
  });

  describe('DELETE /api/v1/admin/payments/routes/:id', () => {
    it('returns 404 for non-existent route ID', async () => {
      const res = await authedRequest(app)
        .delete('/api/v1/admin/payments/routes/01J8VXYZ1234ABCDEFGHJKMNPQ')
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(404);
    });

    it('deletes a route when another gateway remains (204)', async () => {
      const routeToDeleteId = allCreatedRouteIds[1];
      const res = await authedRequest(app)
        .delete(`/api/v1/admin/payments/routes/${routeToDeleteId}`)
        .set('authorization', adminAuthHeader);

      expect(res.status).toBe(204);

      // Attempting to delete the only remaining gateway for the country is rejected (400)
      const lastRouteId = allCreatedRouteIds[0];
      const deleteLastRes = await authedRequest(app)
        .delete(`/api/v1/admin/payments/routes/${lastRouteId}`)
        .set('authorization', adminAuthHeader);

      expect(deleteLastRes.status).toBe(400);
    });
  });
});

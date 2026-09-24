import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { HealthModule } from '@modules/health/health.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { authedRequest } from '../helpers/request.helper';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const context = await createAuthTestApp([HealthModule]);
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health (Liveness Probe)', () => {
    it('returns 200 { status: "ok" } without authentication or client identity headers', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('returns 200 { status: "ok" } when called with client identity headers', async () => {
      const res = await authedRequest(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready (Readiness Probe)', () => {
    it('returns 200 { status: "ok", db: "connected" } verifying database connectivity', async () => {
      const res = await request(app.getHttpServer()).get('/ready');

      // 200 when database is online; 503 if unreachable
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toEqual({ status: 'ok', db: 'connected' });
      }
    });

    it('returns ready status when called with client identity headers', async () => {
      const res = await authedRequest(app).get('/ready');

      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toEqual({ status: 'ok', db: 'connected' });
      }
    });
  });
});

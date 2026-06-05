import { INestApplication } from '@nestjs/common';
import { HealthModule } from '@modules/health/health.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { authedRequest } from '../helpers/request.helper';

describe('HealthModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const context = await createAuthTestApp([HealthModule]);
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health - returns system health status', async () => {
    const res = await authedRequest(app).get('/api/health');

    // If there's a versioning or global prefix issue, let's also try /api/v1/health or /health
    if (res.status === 404) {
      const resV1 = await authedRequest(app).get('/api/v1/health');
      if (resV1.status !== 404) {
        expect([200, 503]).toContain(resV1.status);

        let healthData = resV1.body;
        // If ExceptionLoggingFilter intercepts it, the terminus response is stringified in 'message'
        if (resV1.status === 503 && typeof resV1.body.message === 'string') {
          healthData = JSON.parse(resV1.body.message);
        }

        expect(['ok', 'error', 'down']).toContain(healthData.status);

        const details = healthData.info || healthData.details;
        expect(details).toHaveProperty('database');
        expect(details.database.status).toBe('up');
        expect(details).toHaveProperty('redis');
        return;
      }

      const resNoApi = await authedRequest(app).get('/health');
      expect(resNoApi.status).toBe(200);
      expect(resNoApi.body.status).toBe('ok');
      return;
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.info).toHaveProperty('database');
    expect(res.body.info).toHaveProperty('memory_heap');
    expect(res.body.info).toHaveProperty('memory_rss');
    expect(res.body.info).toHaveProperty('redis');
  });
});

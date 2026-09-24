import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LoginTicket,
  OAuth2Client,
  VerifyIdTokenOptions,
} from 'google-auth-library';
import request from 'supertest';

import { CreditsModule } from '@modules/credits/credits.module';
import { MaintenanceModule } from '@modules/maintenance/maintenance.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';

import { createAuthTestApp } from '../helpers/app-test.helper';

describe('MaintenanceController (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  const validOidcToken = 'valid-gcp-oidc-test-token';
  let verifyIdTokenSpy: jest.SpyInstance;

  beforeAll(async () => {
    const context = await createAuthTestApp([
      PubSubModule,
      CreditsModule,
      SubscriptionsModule,
      MaintenanceModule,
    ]);
    app = context.app;
    configService = app.get(ConfigService);

    // Mock OAuth2Client verification for GcpOidcAuthGuard
    verifyIdTokenSpy = (
      jest.spyOn(
        OAuth2Client.prototype,
        'verifyIdToken',
      ) as unknown as jest.SpyInstance<
        Promise<LoginTicket>,
        [VerifyIdTokenOptions]
      >
    ).mockImplementation(async (opts) => {
      if (opts.idToken === validOidcToken) {
        const expectedProjectId =
          configService.get<string>('GCP_PROJECT_ID') || 'test-project';
        return {
          getPayload: () => ({
            iss: 'https://accounts.google.com',
            aud:
              configService.get<string>('GCP_OIDC_AUDIENCE') || 'test-audience',
            email: `cloud-scheduler@${expectedProjectId}.iam.gserviceaccount.com`,
            email_verified: true,
          }),
        } as unknown as LoginTicket;
      }
      throw new Error('Invalid OIDC token');
    });
  });

  afterAll(async () => {
    verifyIdTokenSpy?.mockRestore();
    await app.close();
  });

  describe('GCP OIDC Guard Protection', () => {
    it('rejects unauthenticated requests lacking Bearer token (401)', async () => {
      // Act
      const res = await request(app.getHttpServer()).post(
        '/api/v1/internal/jobs/expire-likes',
      );

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid Bearer token (401)', async () => {
      // Act
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/expire-likes')
        .set('Authorization', 'Bearer invalid-token');

      // Assert
      expect(res.status).toBe(401);
    });
  });

  describe('Internal Maintenance Jobs (POST /api/v1/internal/jobs/...) ', () => {
    it('POST /api/v1/internal/jobs/expire-likes - voids pending likes past TTL (200)', async () => {
      // Act
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/expire-likes')
        .set('Authorization', `Bearer ${validOidcToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('voidedCount');
      expect(typeof res.body.voidedCount).toBe('number');
    });

    it('POST /api/v1/internal/jobs/expire-bundles - fans out credit bundle expiration (200)', async () => {
      // Act
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/expire-bundles')
        .set('Authorization', `Bearer ${validOidcToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('batchesPublished');
      expect(res.body).toHaveProperty('totalUsersEnqueued');
      expect(typeof res.body.batchesPublished).toBe('number');
      expect(typeof res.body.totalUsersEnqueued).toBe('number');
    });

    it('POST /api/v1/internal/jobs/expire-subscriptions - expires overdue active subscriptions (200)', async () => {
      // Act
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/expire-subscriptions')
        .set('Authorization', `Bearer ${validOidcToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('POST /api/v1/internal/jobs/warn-expiring-bundles - fans out 7-day bundle warnings (200)', async () => {
      // Act
      const res = await request(app.getHttpServer())
        .post('/api/v1/internal/jobs/warn-expiring-bundles')
        .set('Authorization', `Bearer ${validOidcToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('batchesPublished');
      expect(res.body).toHaveProperty('totalUsersEnqueued');
      expect(typeof res.body.batchesPublished).toBe('number');
      expect(typeof res.body.totalUsersEnqueued).toBe('number');
    });
  });
});

import { createHmac } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { WebhooksModule } from '@modules/webhooks/webhooks.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';

describe('WebhooksController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;

  const TEST_META_APP_SECRET = 'test_meta_app_secret_value_123';

  const computeMetaSignature = (payload: object): string => {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const hash = createHmac('sha256', TEST_META_APP_SECRET)
      .update(raw)
      .digest('hex');
    return `sha256=${hash}`;
  };

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    // Prevent actual GCP PubSub calls
    jest
      .spyOn(PubSubPublisherService.prototype, 'publish')
      .mockResolvedValue('mock-message-id');

    // Inject PubSubModule because Webhooks handlers depend on PubSubPublisherService
    const context = await createAuthTestApp([PubSubModule, WebhooksModule]);
    app = context.app;
    prisma = context.prisma;
    configService = app.get(ConfigService);

    jest
      .spyOn(configService, 'getOrThrow')
      .mockImplementation((key: string) => {
        if (key === 'META_APP_SECRET') return TEST_META_APP_SECRET;
        return (configService as any).get(key);
      });
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('GET /api/v1/webhooks/meta (Verification)', () => {
    it('should successfully verify the webhook with correct token', async () => {
      const verifyToken = configService.get<string>('META_VERIFY_TOKEN');
      const challenge = '1234567890';

      const res = await request(app.getHttpServer()).get(
        `/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
      );

      expect(res.status).toBe(200);
      expect(res.text).toBe(challenge);
    });

    it('should fail to verify the webhook with incorrect token', async () => {
      const challenge = '1234567890';

      const res = await request(app.getHttpServer()).get(
        `/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=${challenge}`,
      );

      // It returns HTTP 200 with text 'Verification failed' according to controller implementation
      expect(res.status).toBe(200);
      expect(res.text).toBe('Verification failed');
    });

    it('should fail to verify the webhook with incorrect mode', async () => {
      const verifyToken = configService.get<string>('META_VERIFY_TOKEN');
      const challenge = '1234567890';

      const res = await request(app.getHttpServer()).get(
        `/api/v1/webhooks/meta?hub.mode=wrong_mode&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
      );

      expect(res.status).toBe(200);
      expect(res.text).toBe('Verification failed');
    });
  });

  describe('POST /api/v1/webhooks/meta (Event Handling)', () => {
    it('should reject request without X-Hub-Signature-256 header with 401 Unauthorized', async () => {
      const payload = {
        object: 'instagram',
        entry: [],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .send(payload);

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid X-Hub-Signature-256 header with 401 Unauthorized', async () => {
      const payload = {
        object: 'instagram',
        entry: [],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .set('x-hub-signature-256', 'sha256=invalid_hex_signature_hash')
        .send(payload);

      expect(res.status).toBe(401);
    });

    it('should successfully receive and process a Meta webhook event with valid signature', async () => {
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: '12345',
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'sender_1' },
                recipient: { id: 'recipient_1' },
                timestamp: Date.now(),
                message: {
                  mid: 'm_123',
                  text: 'verify: 123456',
                },
              },
            ],
          },
        ],
      };

      const signature = computeMetaSignature(payload);

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .set('x-hub-signature-256', signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });

    it('should gracefully handle webhook events without message text with valid signature', async () => {
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: '12345',
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'sender_1' },
                recipient: { id: 'recipient_1' },
                timestamp: Date.now(),
                message: {
                  mid: 'm_124',
                },
              },
            ],
          },
        ],
      };

      const signature = computeMetaSignature(payload);

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .set('x-hub-signature-256', signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });

    it('should gracefully handle webhook events with unknown intent with valid signature', async () => {
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: '12345',
            time: Date.now(),
            // Empty messaging means intent is UNKNOWN
            messaging: [],
          },
        ],
      };

      const signature = computeMetaSignature(payload);

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .set('x-hub-signature-256', signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });
  });
});

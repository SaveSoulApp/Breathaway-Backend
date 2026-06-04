import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { WebhooksModule } from '@modules/webhooks/webhooks.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import request from 'supertest';



describe('WebhooksController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    // Prevent actual GCP PubSub calls
    jest.spyOn(PubSubPublisherService.prototype, 'publish').mockResolvedValue('mock-message-id');

    // Inject PubSubModule because Webhooks handlers depend on PubSubPublisherService
    const context = await createAuthTestApp([PubSubModule, WebhooksModule]);
    app = context.app;
    prisma = context.prisma;
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
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
    it('should successfully receive and process a Meta webhook event', async () => {
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

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });

    it('should gracefully handle webhook events without message text', async () => {
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

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });

    it('should gracefully handle webhook events with unknown intent', async () => {
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

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/meta')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.text).toBe('EVENT_RECEIVED');
    });
  });
});

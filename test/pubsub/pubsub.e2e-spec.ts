import {
  Controller,
  INestApplication,
  Injectable,
  Module,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';

import { PubSubListener } from '@modules/pubsub/pubsub.decorator';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import { createAuthTestApp } from '../helpers/app-test.helper';

// Define a test handler to track if our event gets processed
@Injectable()
class DummyPubSubHandler {
  public receivedData: any = null;
  public receivedMessageId: string | null = null;

  @PubSubListener('test.event')
  async handleTestEvent(data: any, messageId: string) {
    this.receivedData = data;
    this.receivedMessageId = messageId;
  }

  @PubSubListener('error.event')
  async handleErrorEvent(data: any, messageId: string) {
    throw new Error('Test handler error');
  }
}

@Module({
  providers: [DummyPubSubHandler],
})
class DummyModule {}

describe('PubSubIngestionController (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let dummyHandler: DummyPubSubHandler;
  let validToken: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([PubSubModule, DummyModule]);
    app = context.app;
    configService = app.get(ConfigService);
    dummyHandler = app.get(DummyPubSubHandler);

    validToken = 'valid-oidc-bearer-token';

    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(async (opts) => {
        if (opts.idToken === 'valid-oidc-bearer-token') {
          return {
            getPayload: () => ({
              iss: 'https://accounts.google.com',
              aud:
                configService.get<string>('GCP_OIDC_AUDIENCE') ||
                'test-audience',
              email: 'pubsub-invoker@test.iam.gserviceaccount.com',
            }),
          } as any;
        }
        throw new Error('Invalid token');
      });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Reset our tracker
    dummyHandler.receivedData = null;
    dummyHandler.receivedMessageId = null;
  });

  const getBasePayload = (eventType: string, dataObj: any = {}) => {
    return {
      message: {
        messageId: 'test-msg-123',
        attributes: {
          eventType,
        },
        data: Buffer.from(JSON.stringify(dataObj)).toString('base64'),
      },
      subscription: 'projects/myproj/subscriptions/mysub',
    };
  };

  describe('Authentication (GcpOidcAuthGuard)', () => {
    it('should reject requests without a Bearer token', async () => {
      const payload = getBasePayload('test.event');
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.detail).toBe('Invalid or missing Bearer token');
    });

    it('should reject requests with an invalid Bearer token', async () => {
      const payload = getBasePayload('test.event');
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', 'Bearer invalid_token')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.detail).toBe('Invalid OIDC token');
    });

    it('should allow requests with a valid Bearer token', async () => {
      const payload = getBasePayload('test.event');
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      // The handler returns void, so the controller returns 200 OK
      expect(res.status).toBe(200);
    });
  });

  describe('Event Routing and Execution', () => {
    it('should return 200 OK for an unregistered event type and log a warning', async () => {
      const payload = getBasePayload('unregistered.event');
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(dummyHandler.receivedData).toBeNull();
    });

    it('should successfully execute the registered handler', async () => {
      const dataObj = { foo: 'bar', value: 42 };
      const payload = getBasePayload('test.event', dataObj);

      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(dummyHandler.receivedMessageId).toBe('test-msg-123');
      expect(dummyHandler.receivedData).toEqual(dataObj);
    });

    it('should return 500 if the handler throws an error (to trigger Pub/Sub retry)', async () => {
      const payload = getBasePayload('error.event');
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(500);
      expect(res.body.detail).toBe('An unexpected error occurred.');
    });

    it('should ignore and return 200 for payloads with missing message objects', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ somethingElse: true });

      expect(res.status).toBe(200);
    });

    it('should ignore and return 200 for payloads with missing eventType attribute', async () => {
      const payload = {
        message: {
          messageId: 'test-msg-123',
          attributes: {},
          data: 'dGVzdA==', // 'test' in base64
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/pubsub/ingest')
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload);

      expect(res.status).toBe(200);
    });
  });
});

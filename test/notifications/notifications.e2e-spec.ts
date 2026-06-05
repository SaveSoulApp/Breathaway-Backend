import { INestApplication } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import request from 'supertest';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';

import { authedRequest } from '../helpers/request.helper';

// Mock the FirebaseService and EmailService if they exist inside NotificationsModule
// to avoid hitting actual external providers during E2E.
jest.mock('@modules/firebase/firebase.service', () => {
  return {
    FirebaseService: jest.fn().mockImplementation(() => {
      return {
        sendMulticast: jest.fn().mockResolvedValue({
          successCount: 1,
          failureCount: 0,
        }),
      };
    }),
  };
});

import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';

describe('NotificationsModule (e2e)', () => {
  let app: INestApplication;
  let pubsubPublisherService: PubSubPublisherService;

  beforeAll(async () => {
    const context = await createAuthTestApp([PubSubModule, NotificationsModule]);
    app = context.app;
    
    // Mock publish to prevent keeping PubSub connections open
    pubsubPublisherService = app.get(PubSubPublisherService);
    jest.spyOn(pubsubPublisherService, 'publish').mockResolvedValue('msg-id-123' as any);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/v1/notifications/send - enqueues a notification successfully', async () => {
    const res = await authedRequest(app)
      .post('/api/v1/notifications/send')
      .send({
        channels: [NotificationChannel.PUSH],
        userIds: ['user-123'],
        title: 'Test Notification',
        body: 'This is a test notification payload',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      });

    if (res.status === 400) console.log(JSON.stringify(res.body, null, 2));
    
    // The controller returns 202 ACCEPTED
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.userCount).toBe(1);
  });

  it('POST /api/v1/notifications/send - fails on bad request', async () => {
    const res = await authedRequest(app)
      .post('/api/v1/notifications/send')
      .send({
        channels: ['UNKNOWN_CHANNEL'],
        userIds: [],
        title: '',
        body: '',
      });

    expect(res.status).toBe(400); // Bad Request validation failure
  });
});

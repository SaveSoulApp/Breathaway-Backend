import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import {
  buildBasicAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
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

describe('NotificationsModule (e2e)', () => {
  let app: INestApplication;
  let pubsubPublisherService: PubSubPublisherService;
  let adminBasicAuthHeader: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([
      PubSubModule,
      NotificationsModule,
    ]);
    app = context.app;

    const configService = app.get(ConfigService);
    adminBasicAuthHeader = buildBasicAuthHeader(
      configService.get<string>('ADMIN_USERNAME') ?? 'admin',
      configService.get<string>('ADMIN_PASSWORD') ?? 'adminpass',
    );

    // Mock publish to prevent keeping PubSub connections open
    pubsubPublisherService = app.get(PubSubPublisherService);
    jest
      .spyOn(pubsubPublisherService, 'publish')
      .mockResolvedValue('msg-id-123' as any);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/v1/notifications/send - fails with 401 when called without admin basic auth', async () => {
    // Arrange & Act
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

    // Assert
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/notifications/send - fails with 401 when called with invalid admin basic auth', async () => {
    // Arrange
    const invalidAuthHeader = buildBasicAuthHeader('wrong-user', 'wrong-pass');

    // Act
    const res = await authedRequest(app)
      .post('/api/v1/notifications/send')
      .set('authorization', invalidAuthHeader)
      .send({
        channels: [NotificationChannel.PUSH],
        userIds: ['user-123'],
        title: 'Test Notification',
        body: 'This is a test notification payload',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      });

    // Assert
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/notifications/send - enqueues a notification successfully with valid basic auth', async () => {
    // Arrange & Act
    const res = await authedRequest(app)
      .post('/api/v1/notifications/send')
      .set('authorization', adminBasicAuthHeader)
      .send({
        channels: [NotificationChannel.PUSH],
        userIds: ['user-123'],
        title: 'Test Notification',
        body: 'This is a test notification payload',
        type: NotificationType.SYSTEM_ALERT,
        category: NotificationCategory.SYSTEM,
      });

    // Assert
    // The controller returns 202 ACCEPTED
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.userCount).toBe(1);
  });

  it('POST /api/v1/notifications/send - fails on bad request with valid basic auth', async () => {
    // Arrange & Act
    const res = await authedRequest(app)
      .post('/api/v1/notifications/send')
      .set('authorization', adminBasicAuthHeader)
      .send({
        channels: ['UNKNOWN_CHANNEL'],
        userIds: [],
        title: '',
        body: '',
      });

    // Assert
    expect(res.status).toBe(400); // Bad Request validation failure
  });
});

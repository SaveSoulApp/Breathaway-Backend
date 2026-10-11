import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { NotificationCategory } from '@modules/notifications/enums/notification-category.enum';
import { NotificationChannel } from '@modules/notifications/enums/notification-channel.enum';
import { NotificationPriority } from '@modules/notifications/enums/notification-priority.enum';
import { NotificationType } from '@modules/notifications/enums/notification-type.enum';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import {
  buildAdminAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

// Mock the FirebaseService if it exists inside NotificationsModule
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
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let pubsubPublisherService: PubSubPublisherService;
  let adminAuthHeader: string;

  const allCreatedUserIds: string[] = [];
  let user1Id: string;
  let user1Jwt: string;
  let user2Id: string;
  let user2Jwt: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([
      PubSubModule,
      NotificationsModule,
    ]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    adminAuthHeader = buildAdminAuthHeader();

    // Mock publish to prevent keeping PubSub connections open
    pubsubPublisherService = app.get(PubSubPublisherService);
    jest
      .spyOn(pubsubPublisherService, 'publish')
      .mockResolvedValue('msg-id-123' as any);

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
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    if (app) {
      await app.close();
    }
  });

  describe('Admin Notification Dispatch (POST /api/v1/notifications/send)', () => {
    it('fails with 401 when called without admin auth', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/notifications/send')
        .send({
          channels: [NotificationChannel.PUSH],
          userIds: [user1Id],
          title: 'Test Notification',
          body: 'This is a test notification payload',
          type: NotificationType.SYSTEM_ALERT,
          category: NotificationCategory.SYSTEM,
        });

      expect(res.status).toBe(401);
    });

    it('fails with 401 when called with invalid admin auth', async () => {
      const invalidAuthHeader = buildAdminAuthHeader('wrong-token');

      const res = await authedRequest(app)
        .post('/api/v1/notifications/send')
        .set('authorization', invalidAuthHeader)
        .send({
          channels: [NotificationChannel.PUSH],
          userIds: [user1Id],
          title: 'Test Notification',
          body: 'This is a test notification payload',
          type: NotificationType.SYSTEM_ALERT,
          category: NotificationCategory.SYSTEM,
        });

      expect(res.status).toBe(401);
    });

    it('enqueues a notification successfully with valid admin auth (202)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/notifications/send')
        .set('authorization', adminAuthHeader)
        .send({
          channels: [NotificationChannel.PUSH],
          userIds: [user1Id],
          title: 'Test Notification',
          body: 'This is a test notification payload',
          type: NotificationType.SYSTEM_ALERT,
          category: NotificationCategory.SYSTEM,
        });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.userCount).toBe(1);
    });

    it('fails on bad request with valid admin auth (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/notifications/send')
        .set('authorization', adminAuthHeader)
        .send({
          channels: ['UNKNOWN_CHANNEL'],
          userIds: [],
          title: '',
          body: '',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('User Inbox Feeds and Actions (/api/v1/notifications)', () => {
    let notif1Id: string;
    let notif2Id: string;
    let notif3User2Id: string;

    beforeAll(async () => {
      // Seed notifications for user 1
      const n1 = await prisma.notification.create({
        data: {
          userId: user1Id,
          type: NotificationType.WELCOME,
          category: NotificationCategory.MARKETING,
          priority: NotificationPriority.NORMAL,
          title: 'Welcome to Breathaway!',
          body: 'We are thrilled to have you here.',
          isRead: false,
        },
      });
      notif1Id = n1.id;

      const n2 = await prisma.notification.create({
        data: {
          userId: user1Id,
          type: NotificationType.SYSTEM_ALERT,
          category: NotificationCategory.SYSTEM,
          priority: NotificationPriority.HIGH,
          title: 'Security Alert',
          body: 'New login detected on your account.',
          isRead: false,
        },
      });
      notif2Id = n2.id;

      // Seed notification for user 2
      const n3 = await prisma.notification.create({
        data: {
          userId: user2Id,
          type: NotificationType.NEW_MATCH,
          category: NotificationCategory.SOCIAL,
          priority: NotificationPriority.NORMAL,
          title: 'You got a new match!',
          body: 'Say hello to your match.',
          isRead: false,
        },
      });
      notif3User2Id = n3.id;
    });

    it('GET /api/v1/notifications - rejects unauthenticated requests (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/notifications - returns paginated notifications for current user (200)', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/notifications')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty('hasMore');

      // Ensure no notification from user2 leaks into user1's feed
      const hasOtherUserNotif = res.body.items.some(
        (item: any) => item.id === notif3User2Id,
      );
      expect(hasOtherUserNotif).toBe(false);
    });

    it('GET /api/v1/notifications - filters by category (200)', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/notifications')
        .query({ category: NotificationCategory.SYSTEM })
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(
        res.body.items.every(
          (item: any) => item.category === NotificationCategory.SYSTEM,
        ),
      ).toBe(true);
    });

    it('GET /api/v1/notifications/unread-count - returns unread count (200)', async () => {
      const unauthRes = await authedRequest(app).get(
        '/api/v1/notifications/unread-count',
      );
      expect(unauthRes.status).toBe(401);

      const res = await authedRequest(app)
        .get('/api/v1/notifications/unread-count')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unreadCount');
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(2);
    });

    it('PATCH /api/v1/notifications/:id/read - marks single notification as read (200)', async () => {
      // 401 unauthenticated
      const unauthRes = await authedRequest(app).patch(
        `/api/v1/notifications/${notif1Id}/read`,
      );
      expect(unauthRes.status).toBe(401);

      // 404 for notification belonging to another user
      const crossUserRes = await authedRequest(app)
        .patch(`/api/v1/notifications/${notif3User2Id}/read`)
        .set('authorization', `Bearer ${user1Jwt}`);
      expect(crossUserRes.status).toBe(404);

      // 200 marks as read
      const res = await authedRequest(app)
        .patch(`/api/v1/notifications/${notif1Id}/read`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(notif1Id);
      expect(res.body.isRead).toBe(true);
      expect(res.body.readAt).toBeDefined();
    });

    it('POST /api/v1/notifications/read-all - marks all unread notifications as read (200)', async () => {
      // 401 unauthenticated
      const unauthRes = await authedRequest(app).post(
        '/api/v1/notifications/read-all',
      );
      expect(unauthRes.status).toBe(401);

      // 200 marks all unread as read
      const res = await authedRequest(app)
        .post('/api/v1/notifications/read-all')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('updatedCount');

      // Verify unread count is now 0 for user1
      const countRes = await authedRequest(app)
        .get('/api/v1/notifications/unread-count')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(countRes.status).toBe(200);
      expect(countRes.body.unreadCount).toBe(0);
    });

    it('DELETE /api/v1/notifications/:id - dismisses notification (204)', async () => {
      // 401 unauthenticated
      const unauthRes = await authedRequest(app).delete(
        `/api/v1/notifications/${notif1Id}`,
      );
      expect(unauthRes.status).toBe(401);

      // 404 for notification belonging to another user
      const crossUserRes = await authedRequest(app)
        .delete(`/api/v1/notifications/${notif3User2Id}`)
        .set('authorization', `Bearer ${user1Jwt}`);
      expect(crossUserRes.status).toBe(404);

      // 204 successfully dismisses
      const res = await authedRequest(app)
        .delete(`/api/v1/notifications/${notif1Id}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(204);

      // Subsequent dismiss on already dismissed notification returns 404
      const secondDismissRes = await authedRequest(app)
        .delete(`/api/v1/notifications/${notif1Id}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(secondDismissRes.status).toBe(404);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { SocialIdentitiesModule } from '@modules/social-identities/social-identities.module';

import {
  buildBasicAuthHeader,
  createAuthTestApp,
} from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('SocialIdentitiesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;
  let basicAuthHeader: string;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    originalFetch = global.fetch;

    const context = await createAuthTestApp([SocialIdentitiesModule]);
    app = context.app;
    prisma = context.prisma;
    configService = app.get(ConfigService);

    const adminUser = configService.getOrThrow<string>('ADMIN_USERNAME');
    const adminPass = configService.getOrThrow<string>('ADMIN_PASSWORD');
    basicAuthHeader = buildBasicAuthHeader(adminUser, adminPass);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('POST /api/v1/social-identities/verify/instagram', () => {
    it('should verify a valid instagram identity with admin credentials', async () => {
      // Mock global fetch for success
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: '17841400000000000',
          name: 'Test User',
          username: 'testuser',
          profile_pic: 'https://example.com/pic.jpg',
          is_verified_user: true,
          follower_count: 1000,
          is_user_follow_business: false,
          is_business_follow_user: false,
        }),
      });

      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .set('authorization', basicAuthHeader)
        .send({ instagramId: '17841400000000000' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: '17841400000000000',
        name: 'Test User',
        username: 'testuser',
        profilePic: 'https://example.com/pic.jpg',
        isVerifiedUser: true,
        followerCount: 1000,
        isUserFollowBusiness: false,
        isBusinessFollowUser: false,
        platform: 'instagram',
      });
    });

    it('should reject unauthorized requests when admin basic auth is missing (401)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .send({ instagramId: '17841400000000000' });

      expect(res.status).toBe(401);
    });

    it('should reject non-numeric or parameter injection instagramId (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .set('authorization', basicAuthHeader)
        .send({ instagramId: 'foo?bar=1' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        'instagramId must be a numeric string',
      );
    });

    it('should handle Instagram API errors gracefully', async () => {
      // Mock global fetch for failure
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid user id',
          },
        }),
      });

      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .set('authorization', basicAuthHeader)
        .send({ instagramId: '999999999' });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('Instagram API Error: Invalid user id');
    });

    it('should throw InternalServerErrorException if INSTAGRAM_ACCESS_TOKEN is missing', async () => {
      const originalGet = configService.get.bind(configService);
      const configSpy = jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string) => {
          if (key === 'INSTAGRAM_ACCESS_TOKEN') return undefined;
          return originalGet(key);
        });

      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .set('authorization', basicAuthHeader)
        .send({ instagramId: '17841400000000000' });

      expect(res.status).toBe(500);
      expect(res.body.detail).toBe(
        'Instagram verification is currently unavailable.',
      );

      // Restore only the specific mock
      configSpy.mockRestore();
    });

    it('should reject invalid payload without instagramId (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/social-identities/verify/instagram')
        .set('authorization', basicAuthHeader)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});

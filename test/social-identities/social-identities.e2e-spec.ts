import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { SocialidentityModule } from '@modules/social-identities/social-identities.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('SocialidentityController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  let originalFetch: typeof global.fetch;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    originalFetch = global.fetch;

    const context = await createAuthTestApp([SocialidentityModule]);
    app = context.app;
    prisma = context.prisma;
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('POST /api/v1/social-identity/verify/instagram', () => {
    it('should verify a valid instagram identity', async () => {
      // Mock global fetch for success
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test_ig_123',
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
        .post('/api/v1/social-identity/verify/instagram')
        .send({ instagramId: 'test_ig_123' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 'test_ig_123',
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
        .post('/api/v1/social-identity/verify/instagram')
        .send({ instagramId: 'invalid_ig_id' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'Instagram API Error: Invalid user id',
      );
    });

    it('should throw InternalServerErrorException if INSTAGRAM_ACCESS_TOKEN is missing', async () => {
      const originalGet = configService.get.bind(configService);
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_ACCESS_TOKEN') return undefined;
        return originalGet(key);
      });

      const res = await authedRequest(app)
        .post('/api/v1/social-identity/verify/instagram')
        .send({ instagramId: 'test_ig_123' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe(
        'Instagram verification is currently unavailable.',
      );

      // Restore the mock
      jest.restoreAllMocks();
    });
  });
});

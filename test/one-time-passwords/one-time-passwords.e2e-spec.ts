import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { OneTimePasswordsModule } from '@modules/one-time-passwords/one-time-passwords.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('OneTimePasswordsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([OneTimePasswordsModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  async function createTestUser() {
    const user = await prisma.user.create({ data: {} });
    allCreatedUserIds.push(user.id);
    const token = jwtService.sign({
      sub: user.id,
      iss: configService.get<string>('JWT_ISSUER'),
      aud: configService.get<string>('JWT_AUDIENCE'),
    });
    return { user, token };
  }

  describe('OTP Endpoints', () => {
    it('POST /api/v1/one-time-passwords/generate - generates a new OTP', async () => {
      const { token } = await createTestUser();
      const res = await authedRequest(app)
        .post('/api/v1/one-time-passwords/generate')
        .set('authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('otp');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.otp).toBe('string');
      expect(typeof res.body.expiresIn).toBe('number');
    });

    it('POST /api/v1/one-time-passwords/verify - verifies a generated OTP', async () => {
      const { user, token } = await createTestUser();

      // First generate
      const genRes = await authedRequest(app)
        .post('/api/v1/one-time-passwords/generate')
        .set('authorization', `Bearer ${token}`)
        .send();

      const { otp } = genRes.body;

      // Then verify
      const verifyRes = await authedRequest(app)
        .post('/api/v1/one-time-passwords/verify')
        .set('authorization', `Bearer ${token}`)
        .send({ otp });

      expect(verifyRes.status).toBe(201);
      expect(verifyRes.body).toHaveProperty('userId');
      expect(verifyRes.body.userId).toBe(user.id);
    });

    it('POST /api/v1/one-time-passwords/verify - fails with invalid OTP', async () => {
      const { token } = await createTestUser();

      const verifyRes = await authedRequest(app)
        .post('/api/v1/one-time-passwords/verify')
        .set('authorization', `Bearer ${token}`)
        .send({ otp: 'invalid-otp-value' });

      expect(verifyRes.status).toBe(400); // BadRequest
      expect(verifyRes.body.detail).toBe('Invalid or expired OTP');
    });

    it('POST /api/v1/one-time-passwords/verify - fails to verify the same OTP twice', async () => {
      const { token } = await createTestUser();

      // First generate
      const genRes = await authedRequest(app)
        .post('/api/v1/one-time-passwords/generate')
        .set('authorization', `Bearer ${token}`)
        .send();

      const { otp } = genRes.body;

      // Verify first time
      const verifyRes1 = await authedRequest(app)
        .post('/api/v1/one-time-passwords/verify')
        .set('authorization', `Bearer ${token}`)
        .send({ otp });

      expect(verifyRes1.status).toBe(201);

      // Verify second time
      const verifyRes2 = await authedRequest(app)
        .post('/api/v1/one-time-passwords/verify')
        .set('authorization', `Bearer ${token}`)
        .send({ otp });

      expect(verifyRes2.status).toBe(400);
      expect(verifyRes2.body.detail).toBe('Invalid or expired OTP');
    });

    it('POST /api/v1/one-time-passwords/generate - enforces rate limiting', async () => {
      const { token } = await createTestUser();

      // Generate first time
      await authedRequest(app)
        .post('/api/v1/one-time-passwords/generate')
        .set('authorization', `Bearer ${token}`)
        .send();

      // Generate second time (should hit rate limit)
      const res = await authedRequest(app)
        .post('/api/v1/one-time-passwords/generate')
        .set('authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(429); // TOO_MANY_REQUESTS
      expect(res.body.detail).toBe('Please wait before requesting another OTP.');
    });
  });
});

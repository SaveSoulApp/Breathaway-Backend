import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { ProfileModule } from '@modules/profiles/profiles.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('ProfileController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([ProfileModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Profile Endpoints', () => {
    let seededUserId: string;
    let validJwt: string;
    let secondUserId: string;
    let secondUserJwt: string;

    beforeAll(async () => {
      // Seed first user
      const user1 = await prisma.user.create({ data: {} });
      seededUserId = user1.id;
      allCreatedUserIds.push(user1.id);

      validJwt = jwtService.sign({
        sub: user1.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      // Seed second user
      const user2 = await prisma.user.create({ data: {} });
      secondUserId = user2.id;
      allCreatedUserIds.push(user2.id);

      secondUserJwt = jwtService.sign({
        sub: user2.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    it('POST /api/v1/profile - creates a new profile', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          gender: 'MALE',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        firstName: 'John',
        lastName: 'Doe',
        gender: 'MALE',
        userId: seededUserId,
      });
    });

    it('POST /api/v1/profile - conflicts when creating profile twice', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          firstName: 'Jane',
        });

      expect(res.status).toBe(409);
    });

    it('GET /api/v1/profile - returns my profile', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        firstName: 'John',
        lastName: 'Doe',
        gender: 'MALE',
        userId: seededUserId,
      });
    });

    it('GET /api/v1/profile/:id - returns profile by id', async () => {
      // First get the profile to know its ID
      const myProfileRes = await authedRequest(app)
        .get('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`);

      const profileId = myProfileRes.body.id;

      const res = await authedRequest(app)
        .get(`/api/v1/profile/${profileId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: profileId,
        firstName: 'John',
      });
    });

    it('GET /api/v1/profile/:id - 404 for unknown profile ID', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/profile/01H1V1ABCD2EF3GH4JK5LM6NP7') // Using a random ULID-like format or any string
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(404);
    });

    it('PUT /api/v1/profile - fully updates profile', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          firstName: 'Johnny',
          lastName: 'Smith',
          dateOfBirth: '1995-05-05',
          gender: 'OTHER',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        firstName: 'Johnny',
        lastName: 'Smith',
        gender: 'OTHER',
      });
    });

    it('PATCH /api/v1/profile - partially updates profile', async () => {
      const res = await authedRequest(app)
        .patch('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          firstName: 'Jonathan',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        firstName: 'Jonathan',
        lastName: 'Smith', // Should remain unchanged
      });
    });

    it('GET /api/v1/profile - 404 if profile does not exist', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/profile')
        .set('authorization', `Bearer ${secondUserJwt}`);

      expect(res.status).toBe(404);
    });

    it('DELETE /api/v1/profile - deletes the profile', async () => {
      const res = await authedRequest(app)
        .delete('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const checkRes = await authedRequest(app)
        .get('/api/v1/profile')
        .set('authorization', `Bearer ${validJwt}`);

      expect(checkRes.status).toBe(404);
    });
  });
});

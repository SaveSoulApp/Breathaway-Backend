import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IdentityModule } from '@modules/identities/identities.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';
import { IdentityType } from '@prisma/client';

describe('IdentityController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([PubSubModule, IdentityModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Identity Endpoints', () => {
    let seededUserId: string;
    let validJwt: string;
    let otherUserId: string;
    let otherUserJwt: string;

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
      otherUserId = user2.id;
      allCreatedUserIds.push(user2.id);

      otherUserJwt = jwtService.sign({
        sub: user2.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    it('POST /api/v1/identities - creates a new identity', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: 'test@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        type: IdentityType.EMAIL,
        isVerified: false,
        publicValueMasked: expect.any(String),
      });
      expect(res.body.publicValue).toBeUndefined(); // Should not expose raw value in normal response
    });

    it('POST /api/v1/identities - fails with duplicate public value for same type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: 'TEST@example.com', // testing case insensitivity as well
        });

      expect(res.status).toBe(409); // Conflict
    });

    it('GET /api/v1/identities - returns all identities for the user', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        type: IdentityType.EMAIL,
      });
    });

    it('GET /api/v1/identities/complete - returns complete identities including raw values', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/identities/complete')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        type: IdentityType.EMAIL,
        publicValue: 'test@example.com', // complete endpoint exposes raw values
      });
    });

    it('POST /api/v1/identities/lookup - finds identity by public value', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/lookup')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: 'TEST@example.com', // testing lowercase transformation
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        type: IdentityType.EMAIL,
        publicValue: 'test@example.com',
      });
    });

    it('POST /api/v1/identities/lookup - 404 for unknown public value', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/lookup')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: 'unknown@example.com',
        });

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/identities/:id - returns identity by ID', async () => {
      // First get the identity to know its ID
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: identityId,
        type: IdentityType.EMAIL,
      });
      expect(res.body.publicValue).toBeUndefined();
    });

    it('GET /api/v1/identities/:id/complete - returns complete identity by ID', async () => {
      // First get the identity to know its ID
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}/complete`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: identityId,
        type: IdentityType.EMAIL,
        publicValue: 'test@example.com',
      });
    });

    it('GET /api/v1/identities/:id - 404 if accessed by another user', async () => {
      // First get the identity from first user
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}`)
        .set('authorization', `Bearer ${otherUserJwt}`);

      expect(res.status).toBe(404);
    });

    it('PATCH /api/v1/identities/:id - updates the identity', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .patch(`/api/v1/identities/${identityId}`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          publicValue: 'updated@example.com',
        });

      expect(res.status).toBe(200);

      // Verify complete value was updated
      const completeRes = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}/complete`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(completeRes.body.publicValue).toBe('updated@example.com');
    });

    it('POST /api/v1/identities/:id/verify - marks identity as verified', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .post(`/api/v1/identities/${identityId}/verify`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.isVerified).toBe(true);
    });

    it('DELETE /api/v1/identities/:id - deletes the identity', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .delete(`/api/v1/identities/${identityId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const checkRes = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(checkRes.status).toBe(404);
    });
  });
});

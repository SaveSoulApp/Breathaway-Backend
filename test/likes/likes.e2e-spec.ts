import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IdentityType, IntentType } from '@prisma/client';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { LikesModule } from '@modules/likes/likes.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('LikesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let crypto: IdentityCryptoService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    // LikesModule might depend on PubSubModule through MatchResolver/Match services
    const context = await createAuthTestApp([PubSubModule, LikesModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    crypto = app.get(IdentityCryptoService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Like Endpoints', () => {
    let seededUserId: string;
    let validJwt: string;
    let targetIdentityId: string;

    beforeAll(async () => {
      // Seed current user
      const user1 = await prisma.user.create({ data: {} });
      seededUserId = user1.id;
      allCreatedUserIds.push(user1.id);

      validJwt = jwtService.sign({
        sub: user1.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      // Grant credits so the user can send likes
      await prisma.creditLedger.create({
        data: {
          userId: user1.id,
          transactionType: 'CREDIT',
          amount: 100,
          source: 'ADMIN',
        },
      });

      // Seed another user and their identity to like.
      const user2 = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user2.id);

      const uniqueEmail = `test-likes-${user2.id}@e2e.test`;
      const publicValueData = await crypto.processPublicValue(
        uniqueEmail,
        IdentityType.EMAIL,
      );

      const identity = await prisma.identity.create({
        data: {
          userId: user2.id,
          type: IdentityType.EMAIL,
          isVerified: true,
          ...publicValueData,
        },
      });
      targetIdentityId = identity.id;
    });

    it('POST /api/v1/likes/can-create - checks if like can be created', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes/can-create')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentityId: targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ canCreate: true });
    });

    it('POST /api/v1/likes - creates a like using existing targetIdentityId', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentityId: targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        targetIdentity: { id: targetIdentityId },
        intent: IntentType.RELATIONSHIP,
      });
    });

    it('POST /api/v1/likes - fails to like the same identity again', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentityId: targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(409); // Conflict
    });

    it('POST /api/v1/likes/can-create - returns 409 when like already exists', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes/can-create')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentityId: targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(409);
    });

    it('POST /api/v1/likes - creates a like by resolving a raw identity input', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentity: {
            type: IdentityType.PHONE,
            publicValue: '+19999999999',
          },
          intent: IntentType.CASUAL,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        intent: IntentType.CASUAL,
      });
      expect(res.body.targetIdentity.id).toBeDefined();
    });

    it('GET /api/v1/likes - returns all pending likes for user', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('GET /api/v1/likes/:id - returns like by ID', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);

      const likeId = allRes.body.data[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/likes/${likeId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(likeId);
    });

    it('PATCH /api/v1/likes/:id/label - updates personal label on a like', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);

      const likeId = allRes.body.data[0].id;

      const res = await authedRequest(app)
        .patch(`/api/v1/likes/${likeId}/label`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({ label: 'Met at coffee shop' });

      expect(res.status).toBe(200);
      expect(res.body.label).toBe('Met at coffee shop');
    });

    it('PATCH /api/v1/likes/:id/label - clears label when null provided', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);

      const likeId = allRes.body.data[0].id;

      const res = await authedRequest(app)
        .patch(`/api/v1/likes/${likeId}/label`)
        .set('authorization', `Bearer ${validJwt}`)
        .send({ label: null });

      expect(res.status).toBe(200);
      expect(res.body.label).toBeNull();
    });

    it('DELETE /api/v1/likes/:id - soft deletes a like (204 No Content)', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);

      const likeId = allRes.body.data[0].id;

      const res = await authedRequest(app)
        .delete(`/api/v1/likes/${likeId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(204);

      // Verify it is no longer returned in pending likes
      const checkRes = await authedRequest(app)
        .get(`/api/v1/likes/${likeId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(checkRes.status).toBe(404);
    });

    it('GET /api/v1/likes - rejects request without valid JWT (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/likes');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/likes - rejects request without identity payload (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/likes - rejects self-like when targeting own identity (400 SelfLikeException)', async () => {
      const ownEmail = `self-like-${seededUserId}@e2e.test`;
      const publicValueData = await crypto.processPublicValue(
        ownEmail,
        IdentityType.EMAIL,
      );
      const ownIdentity = await prisma.identity.create({
        data: {
          userId: seededUserId,
          type: IdentityType.EMAIL,
          isVerified: true,
          ...publicValueData,
        },
      });

      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          targetIdentityId: ownIdentity.id,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/likes - rejects when user has 0 credits (402 InsufficientCreditsException)', async () => {
      const zeroCreditUser = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(zeroCreditUser.id);

      const zeroCreditJwt = jwtService.sign({
        sub: zeroCreditUser.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${zeroCreditJwt}`)
        .send({
          targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(402);
    });

    it('POST /api/v1/likes - rejects when x-timezone header is missing (400 RequireTimezoneGuard)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`)
        .set('x-timezone', '')
        .send({
          targetIdentityId,
          intent: IntentType.RELATIONSHIP,
        });

      expect(res.status).toBe(400);
    });
  });
});

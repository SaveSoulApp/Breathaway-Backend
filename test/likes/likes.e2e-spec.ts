import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { LikeModule } from '@modules/likes/likes.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';
import { IdentityType, IntentType } from '@prisma/client';

describe('LikeController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    // LikeModule might depend on PubSubModule through MatchResolver/Match services
    const context = await createAuthTestApp([PubSubModule, LikeModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
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

      // Seed another user and their identity to like
      const user2 = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user2.id);
      
      const identity = await prisma.identity.create({
        data: {
          userId: user2.id,
          type: IdentityType.EMAIL,
          isVerified: true,
          publicValueHash: 'somehash',
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key',
          publicValueMasked: 't**t@test.com',
        },
      });
      targetIdentityId = identity.id;
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
      // We expect 2 likes (one relationship, one casual)
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

    it('DELETE /api/v1/likes/:id - soft deletes a like', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/likes')
        .set('authorization', `Bearer ${validJwt}`);
        
      const likeId = allRes.body.data[0].id;

      const res = await authedRequest(app)
        .delete(`/api/v1/likes/${likeId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);

      // Verify it is no longer returned in pending likes
      const checkRes = await authedRequest(app)
        .get(`/api/v1/likes/${likeId}`)
        .set('authorization', `Bearer ${validJwt}`);
        
      expect(checkRes.status).toBe(404);
    });
  });
});

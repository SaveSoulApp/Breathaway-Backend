import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { MatchesModule } from '@modules/matches/matches.module';
import {
  MatchStatus,
  IntentType,
  IdentityType,
  LikeStatus,
} from '@prisma/client';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('MatchesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  let user1Id: string;
  let user1Jwt: string;
  let user2Id: string;
  let matchId: string;

  beforeAll(async () => {
    // Inject MatchesModule
    const context = await createAuthTestApp([MatchesModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    // Delete matches and likes first to avoid FK constraint violations
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userOneId: { in: allCreatedUserIds } },
          { userTwoId: { in: allCreatedUserIds } },
        ],
      },
    });
    await prisma.like.deleteMany({
      where: {
        OR: [
          { senderUserId: { in: allCreatedUserIds } },
          { targetUserId: { in: allCreatedUserIds } },
        ],
      },
    });
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Matches Endpoints', () => {
    beforeAll(async () => {
      // Seed user 1
      const user1 = await prisma.user.create({
        data: {
          profile: {
            create: {
              firstName: 'Alice',
            },
          },
        },
      });
      user1Id = user1.id;
      allCreatedUserIds.push(user1.id);

      user1Jwt = jwtService.sign({
        sub: user1.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      // Seed user 2
      const user2 = await prisma.user.create({
        data: {
          profile: {
            create: {
              firstName: 'Bob',
            },
          },
        },
      });
      user2Id = user2.id;
      allCreatedUserIds.push(user2.id);

      // Seed identities to link likes
      const uniqueSuffix = Date.now().toString();
      const identity1 = await prisma.identity.create({
        data: {
          userId: user1.id,
          type: IdentityType.PHONE,
          publicValueHash: `hash1-${uniqueSuffix}`,
          publicValueCiphertext: 'ctx1',
          publicValueIv: 'iv1',
          publicValueTag: 'tag1',
          publicValueWrappedKey: 'wk1',
          publicValueKeyId: 'kid1',
        },
      });

      const identity2 = await prisma.identity.create({
        data: {
          userId: user2.id,
          type: IdentityType.PHONE,
          publicValueHash: `hash2-${uniqueSuffix}`,
          publicValueCiphertext: 'ctx2',
          publicValueIv: 'iv2',
          publicValueTag: 'tag2',
          publicValueWrappedKey: 'wk2',
          publicValueKeyId: 'kid2',
        },
      });

      // Seed likes
      const like1 = await prisma.like.create({
        data: {
          senderUserId: user1.id,
          targetIdentityId: identity2.id,
          targetUserId: user2.id,
          intent: IntentType.OPEN,
          status: LikeStatus.MATCHED,
        },
      });

      const like2 = await prisma.like.create({
        data: {
          senderUserId: user2.id,
          targetIdentityId: identity1.id,
          targetUserId: user1.id,
          intent: IntentType.OPEN,
          status: LikeStatus.MATCHED,
        },
      });

      // Seed match
      const match = await prisma.match.create({
        data: {
          userOneId: user1.id,
          userTwoId: user2.id,
          likeOneId: like1.id,
          likeTwoId: like2.id,
          intentOne: IntentType.OPEN,
          intentTwo: IntentType.OPEN,
          status: MatchStatus.ACTIVE,
        },
      });

      matchId = match.id;
    });

    it('GET /api/v1/matches - should return active matches for user', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/matches')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const matchInResponse = res.body.find((m: any) => m.id === matchId);
      expect(matchInResponse).toBeDefined();
      expect(matchInResponse.status).toBe(MatchStatus.ACTIVE);
      expect(matchInResponse.otherUser).toBeDefined();
      expect(matchInResponse.otherUser.id).toBe(user2Id);
      expect(matchInResponse.otherUser.firstName).toBe('Bob');
    });

    it('GET /api/v1/matches/:id - should return specific match details', async () => {
      const res = await authedRequest(app)
        .get(`/api/v1/matches/${matchId}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(matchId);
      expect(res.body.status).toBe(MatchStatus.ACTIVE);
      expect(res.body.otherUser.id).toBe(user2Id);
      expect(res.body.otherUser.firstName).toBe('Bob');
    });

    it('GET /api/v1/matches/:id - should return 404 for non-existent match', async () => {
      // Use random valid ULID
      const res = await authedRequest(app)
        .get('/api/v1/matches/01H1V1ABCD2EF3GH4JK5LM6NP7')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Match not found');
    });

    it('DELETE /api/v1/matches/:id - should unmatch (soft delete) the match', async () => {
      const res = await authedRequest(app)
        .delete(`/api/v1/matches/${matchId}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/v1/matches/:id - should return 404 after unmatching', async () => {
      // Since unmatching soft deletes the match (deletedAt != null), findOneForUser should throw 404
      const res = await authedRequest(app)
        .get(`/api/v1/matches/${matchId}`)
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Match not found');
    });

    it('GET /api/v1/matches - should not include the unmatched match', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/matches')
        .set('authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      const matchInResponse = res.body.find((m: any) => m.id === matchId);
      expect(matchInResponse).toBeUndefined();
    });
  });
});

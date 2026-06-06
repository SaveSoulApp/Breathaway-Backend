import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlocksModule } from '@modules/blocks/blocks.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('BlocksController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([BlocksModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Block Endpoints', () => {
    let seededUserId: string;
    let validJwt: string;
    let otherUserId: string;

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

      // Seed second user to be blocked
      const user2 = await prisma.user.create({ data: {} });
      otherUserId = user2.id;
      allCreatedUserIds.push(user2.id);
    });

    it('POST /api/v1/blocks - creates a block', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/blocks')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          blockedUserId: otherUserId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        blockedUser: { id: otherUserId },
      });
    });

    it('POST /api/v1/blocks - fails if block already exists', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/blocks')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          blockedUserId: otherUserId,
        });

      expect(res.status).toBe(409);
    });

    it('GET /api/v1/blocks - returns all active blocks for user', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/blocks')
        .set('authorization', `Bearer ${validJwt}`);

      if (res.status !== 200) {
        console.log('GET blocks response status:', res.status);
        console.log('GET blocks response body:', res.body);
      }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toMatchObject({
        blockedUser: { id: otherUserId },
      });
    });

    it('GET /api/v1/blocks/:id - returns block by ID', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/blocks')
        .set('authorization', `Bearer ${validJwt}`);

      const blockId = allRes.body[0].id;

      const res = await authedRequest(app)
        .get(`/api/v1/blocks/${blockId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(blockId);
    });

    it('DELETE /api/v1/blocks/:id - removes (unblocks)', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/blocks')
        .set('authorization', `Bearer ${validJwt}`);

      const blockId = allRes.body[0].id;

      const res = await authedRequest(app)
        .delete(`/api/v1/blocks/${blockId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200); // Controller returns HttpCode(OK) which is 200

      // Verify it is removed
      const checkRes = await authedRequest(app)
        .get(`/api/v1/blocks/${blockId}`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(checkRes.status).toBe(404);
    });
  });
});

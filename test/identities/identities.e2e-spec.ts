import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IdentityType } from '@prisma/client';

import { CryptoUtils, hashString } from '@core/crypto/crypto.utils';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { RedisService } from '@infrastructure/redis';
import { IdentitiesModule } from '@modules/identities/identities.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('IdentitiesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let redisService: RedisService;
  let cryptoService: IdentityCryptoService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([PubSubModule, IdentitiesModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    redisService = app.get(RedisService);
    cryptoService = app.get(IdentityCryptoService);
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

    const uniqueSuffix = Date.now();
    const testEmail = `test-${uniqueSuffix}@example.com`;
    const testEmailConflict = `TEST-${uniqueSuffix}@example.com`;
    const testEmailUpdated = `updated-${uniqueSuffix}@example.com`;

    it('POST /api/v1/identities - creates a new identity', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: testEmail,
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
          publicValue: testEmailConflict, // testing case insensitivity as well
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
        publicValue: testEmail, // complete endpoint exposes raw values
      });
    });

    it('POST /api/v1/identities/lookup - finds identity by public value', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/lookup')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          type: IdentityType.EMAIL,
          publicValue: testEmailConflict, // testing lowercase transformation
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        type: IdentityType.EMAIL,
        publicValue: testEmail,
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
        publicValue: testEmail,
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
          publicValue: testEmailUpdated,
        });

      expect(res.status).toBe(200);

      // Verify complete value was updated
      const completeRes = await authedRequest(app)
        .get(`/api/v1/identities/${identityId}/complete`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(completeRes.body.publicValue).toBe(testEmailUpdated);
    });

    it('POST /api/v1/identities/:id/verify - returns 404 (direct verification endpoint removed)', async () => {
      const allRes = await authedRequest(app)
        .get('/api/v1/identities')
        .set('authorization', `Bearer ${validJwt}`);

      const identityId = allRes.body[0].id;

      const res = await authedRequest(app)
        .post(`/api/v1/identities/${identityId}/verify`)
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(404);
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

    it('GET /api/v1/identities - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app).get('/api/v1/identities');
      expect(res.status).toBe(401);
    });
  });

  describe('Email OTP Verification Endpoints', () => {
    let emailUserId: string;
    let emailUserJwt: string;

    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      emailUserId = user.id;
      allCreatedUserIds.push(user.id);

      emailUserJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    const uniqueTimestamp = Date.now();
    const otpTestEmail = `verify-${uniqueTimestamp}@example.com`;

    it('POST /api/v1/identities/email/send-otp - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/send-otp')
        .send({ email: otpTestEmail });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/identities/email/send-otp - rejects invalid email payload (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/send-otp')
        .set('authorization', `Bearer ${emailUserJwt}`)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/identities/email/send-otp - successfully sends OTP for valid email', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/send-otp')
        .set('authorization', `Bearer ${emailUserJwt}`)
        .send({ email: otpTestEmail });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: expect.any(String),
        expiresIn: 600,
        resendAfter: 60,
      });
    });

    it('POST /api/v1/identities/email/send-otp - rejects duplicate send during cooldown (429)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/send-otp')
        .set('authorization', `Bearer ${emailUserJwt}`)
        .send({ email: otpTestEmail });

      expect(res.status).toBe(429);
    });

    it('POST /api/v1/identities/email/verify-otp - rejects unauthenticated request (401)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/verify-otp')
        .send({ email: otpTestEmail, otp: '123456' });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/identities/email/verify-otp - rejects invalid OTP (400)', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/identities/email/verify-otp')
        .set('authorization', `Bearer ${emailUserJwt}`)
        .send({ email: otpTestEmail, otp: '000000' });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/identities/email/verify-otp - successfully verifies OTP and links identity', async () => {
      const publicValueData = await cryptoService.processPublicValue(
        otpTestEmail.toLowerCase().trim(),
        IdentityType.EMAIL,
      );
      const emailHex = CryptoUtils.toHex(publicValueData.publicValueHash);
      const redisKey = `email_verification_otp:${emailUserId}:${emailHex}`;
      const validCode = '849201';

      await redisService.set(
        redisKey,
        JSON.stringify({
          otpHash: hashString(validCode),
          userId: emailUserId,
          email: otpTestEmail.toLowerCase().trim(),
          attempts: 0,
          maxAttempts: 5,
        }),
        'EX',
        600,
      );

      const res = await authedRequest(app)
        .post('/api/v1/identities/email/verify-otp')
        .set('authorization', `Bearer ${emailUserJwt}`)
        .send({ email: otpTestEmail, otp: validCode });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        type: IdentityType.EMAIL,
        isVerified: true,
        publicValueMasked: expect.any(String),
      });

      const dbIdentity = await prisma.identity.findFirst({
        where: {
          userId: emailUserId,
          type: IdentityType.EMAIL,
        },
      });

      expect(dbIdentity).toBeDefined();
      expect(dbIdentity?.isVerified).toBe(true);
    });
  });
});

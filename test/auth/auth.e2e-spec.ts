import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import type { FirebaseValidationResult } from '@modules/firebase/firebase.service';
import { AuthMethod } from '@modules/auth/utils/auth-method.utils';
import {
  buildBasicAuthHeader,
  createAuthTestApp,
  getDevLoginCredentials,
  mockEmailFirebaseToken,
  mockPhoneFirebaseToken,
} from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

// ---------------------------------------------------------------------------
// Auth E2E Test Suite
//
// Strategy:
//   - Real Postgres (Docker) via .env.test
//   - FirebaseService.validateFirebaseToken is replaced by a jest.fn() mock
//   - Each describe block seeds what it needs in beforeAll / beforeEach and
//     removes it in afterAll to keep the DB clean between runs.
// ---------------------------------------------------------------------------

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: IdentityCryptoService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let mockFirebaseValidation: jest.Mock<Promise<FirebaseValidationResult>>;

  // Collects all user IDs created across suites for final teardown
  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, mockFirebaseValidation } = await createAuthTestApp());
    crypto = app.get(IdentityCryptoService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  // =========================================================================
  // POST /api/v1/auth/signup
  // =========================================================================
  describe('POST /api/v1/auth/signup', () => {
    afterEach(() => {
      mockFirebaseValidation.mockReset();
    });

    it('201 – creates a new user via phone and returns pending_verification', async () => {
      const phone = '+19995550101';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        userId: expect.any(String),
        status: 'pending_verification',
      });

      allCreatedUserIds.push(res.body.userId as string);
    });

    it('201 – creates a new user via email and returns pending_verification', async () => {
      const email = 'newuser@e2e.test';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockEmailFirebaseToken(email),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        userId: expect.any(String),
        status: 'pending_verification',
      });

      allCreatedUserIds.push(res.body.userId as string);
    });

    it('409 – conflicts when credential is already verified', async () => {
      // Seed: create a verified user + credential
      const phone = '+19995550102';
      const hash = await crypto.computeHash(phone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(user.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(409);
    });

    it('409 – conflicts when credential is unverified (pending verification)', async () => {
      // Seed: create an unverified user + credential
      const phone = '+19995550103';
      const hash = await crypto.computeHash(phone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: false,
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(user.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(409);
    });

    it('400 – rejects missing body fields', async () => {
      const res = await authedRequest(app).post('/api/v1/auth/signup').send({});

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /api/v1/auth/signin
  // =========================================================================
  describe('POST /api/v1/auth/signin', () => {
    const phone = '+19995550200';
    let seededUserId: string;

    beforeAll(async () => {
      // Seed: verified user
      const hash = await crypto.computeHash(phone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);
    });

    afterEach(() => mockFirebaseValidation.mockReset());

    it('200 – signs in a verified user and returns access_token', async () => {
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: seededUserId,
      });
    });

    it('401 – rejects signin for unverified user', async () => {
      const unverifiedPhone = '+19995550201';
      const hash = await crypto.computeHash(unverifiedPhone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: false,
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(user.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(unverifiedPhone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(401);
    });

    it('404 – not found for unknown credential', async () => {
      const unknownPhone = '+19999999999';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(unknownPhone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/v1/auth/signin-or-signup
  // =========================================================================
  describe('POST /api/v1/auth/signin-or-signup', () => {
    afterEach(() => mockFirebaseValidation.mockReset());

    it('200 – auto-signs-up a brand-new user and returns access_token', async () => {
      const phone = '+19995550300';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin-or-signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: expect.any(String),
      });

      allCreatedUserIds.push(res.body.user_id as string);
    });

    it('200 – auto-signs-in an existing verified user', async () => {
      const phone = '+19995550301';
      const hash = await crypto.computeHash(phone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(user.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin-or-signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: user.id,
      });
    });

    it('401 – rejects existing but unverified user', async () => {
      const phone = '+19995550302';
      const hash = await crypto.computeHash(phone);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: user.id,
          isVerified: false,
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(user.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .post('/api/v1/auth/signin-or-signup')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/auth/social
  // =========================================================================
  describe('POST /api/v1/auth/social', () => {
    afterEach(() => mockFirebaseValidation.mockReset());

    it('200 – creates a new Instagram identity and returns access_token', async () => {
      const res = await authedRequest(app).post('/api/v1/auth/social').send({
        type: 'INSTAGRAM',
        platformUserId: 'ig-user-id-001',
        handle: 'testuser_ig_001',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: expect.any(String),
      });

      allCreatedUserIds.push(res.body.user_id as string);
    });

    it('200 – signs in existing social identity', async () => {
      // Seed: create identity with a known platformIdHash
      const platformUserId = 'ig-user-id-002';
      const handle = 'testuser_ig_002';
      const platformIdHash = await crypto.computeHash(platformUserId);
      const publicValueHash = await crypto.computeHash(handle);

      const user = await prisma.user.create({ data: {} });
      await prisma.identity.create({
        data: {
          type: 'INSTAGRAM',
          publicValueHash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: 'te••••r_002',
          platformIdHash,
          platformIdCiphertext: 'x',
          platformIdIv: 'x',
          platformIdTag: 'x',
          platformIdWrappedKey: 'x',
          platformIdKeyId: 'key-v1',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      allCreatedUserIds.push(user.id);

      const res = await authedRequest(app).post('/api/v1/auth/social').send({
        type: 'INSTAGRAM',
        platformUserId,
        handle,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: user.id,
      });
    });

    it('409 – conflicts when social identity has null userId (deleted account)', async () => {
      // Seed: identity with userId = null (soft-deleted)
      const platformUserId = 'ig-user-id-deleted';
      const handle = 'deleted_user_ig';
      const platformIdHash = await crypto.computeHash(platformUserId);
      const publicValueHash = await crypto.computeHash(handle);

      await prisma.identity.create({
        data: {
          type: 'INSTAGRAM',
          publicValueHash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: 'd••••r_ig',
          platformIdHash,
          platformIdCiphertext: 'x',
          platformIdIv: 'x',
          platformIdTag: 'x',
          platformIdWrappedKey: 'x',
          platformIdKeyId: 'key-v1',
          userId: null, // deleted account
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      const res = await authedRequest(app).post('/api/v1/auth/social').send({
        type: 'INSTAGRAM',
        platformUserId,
        handle,
      });

      expect(res.status).toBe(409);

      // Cleanup this identity since it has no userId
      await prisma.identity.deleteMany({ where: { platformIdHash } });
    });

    it('400 – rejects invalid social type', async () => {
      const res = await authedRequest(app).post('/api/v1/auth/social').send({
        type: 'INVALID_PLATFORM',
        platformUserId: 'some-id',
        handle: 'some-handle',
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /api/v1/auth/dev-login
  // =========================================================================
  describe('POST /api/v1/auth/dev-login', () => {
    const identifier = 'devlogin@e2e.test';
    let seededUserId: string;
    let basicAuthHeader: string;

    beforeAll(async () => {
      // Seed: user with email credential
      const hash = await crypto.computeHash(identifier);
      const user = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'EMAIL',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: 'd••••n@e2e.test',
          userId: user.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: user.id,
          type: 'EMAIL',
          valueHash: hash,
          valueMasked: 'd••••n@e2e.test',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);

      // Build Basic Auth header from .env.test credentials
      const { username, password } = getDevLoginCredentials(configService);
      basicAuthHeader = buildBasicAuthHeader(username, password);
    });

    it('200 – returns access_token for known dev identifier', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/auth/dev-login')
        .set('authorization', basicAuthHeader)
        .send({ identifier });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: seededUserId,
      });
    });

    it('404 – not found for unknown identifier', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/auth/dev-login')
        .set('authorization', basicAuthHeader)
        .send({ identifier: 'ghost@e2e.test' });

      expect(res.status).toBe(404);
    });

    it('401 – missing Basic Auth header', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/auth/dev-login')
        .send({ identifier });

      expect(res.status).toBe(401);
    });

    it('401 – wrong credentials in Basic Auth header', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/auth/dev-login')
        .set('authorization', buildBasicAuthHeader('wrong-user', 'wrong-pass'))
        .send({ identifier });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // PATCH /api/v1/auth/add-phone
  // =========================================================================
  describe('PATCH /api/v1/auth/add-phone', () => {
    let seededUserId: string;
    let validJwt: string;

    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);

      // Generate a real JWT the same way AuthTokenService would
      validJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    afterEach(() => mockFirebaseValidation.mockReset());

    it('200 – adds a new phone credential to an existing user', async () => {
      const phone = '+19995550400';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-phone')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: seededUserId,
      });
    });

    it('409 – conflicts when phone is already in use', async () => {
      // Seed a different user with the same phone
      const phone = '+19995550401';
      const hash = await crypto.computeHash(phone);
      const otherUser = await prisma.user.create({ data: {} });
      const identity = await prisma.identity.create({
        data: {
          type: 'PHONE',
          publicValueHash: hash,
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          publicValueMasked: '**masked**',
          userId: otherUser.id,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      await prisma.authCredential.create({
        data: {
          userId: otherUser.id,
          type: 'PHONE',
          valueHash: hash,
          valueMasked: '**masked**',
          isPrimary: true,
          identityId: identity.id,
        },
      });
      allCreatedUserIds.push(otherUser.id);

      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-phone')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(409);
    });

    it('409 – conflicts when Firebase token is for email, not phone', async () => {
      mockFirebaseValidation.mockResolvedValueOnce(
        mockEmailFirebaseToken('mismatch@e2e.test'),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-phone')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(409);
    });

    it('404 – user not found for an expired/invalid JWT sub', async () => {
      const ghostJwt = jwtService.sign({
        sub: 'non-existent-user-id',
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });

      const phone = '+19995550402';
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken(phone),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-phone')
        .set('authorization', `Bearer ${ghostJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(404);
    });

    it('401 – missing JWT header', async () => {
      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-phone')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // PATCH /api/v1/auth/add-email
  // =========================================================================
  describe('PATCH /api/v1/auth/add-email', () => {
    let seededUserId: string;
    let validJwt: string;

    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);

      validJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    afterEach(() => mockFirebaseValidation.mockReset());

    it('200 – adds a new email credential to an existing user', async () => {
      mockFirebaseValidation.mockResolvedValueOnce(
        mockEmailFirebaseToken('addemail@e2e.test'),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-email')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        access_token: expect.any(String),
        user_id: seededUserId,
      });
    });

    it('409 – conflicts when Firebase token is for phone, not email', async () => {
      mockFirebaseValidation.mockResolvedValueOnce(
        mockPhoneFirebaseToken('+19995550500'),
      );

      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-email')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(409);
    });

    it('401 – missing JWT header', async () => {
      const res = await authedRequest(app)
        .patch('/api/v1/auth/add-email')
        .send({ uid: 'test-uid', uidToken: 'mock-token' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/auth/signout
  // =========================================================================
  describe('POST /api/v1/auth/signout', () => {
    let validJwt: string;

    beforeAll(async () => {
      const user = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user.id);

      validJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    it('204 – signs out an authenticated user', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/auth/signout')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(204);
    });

    it('401 – rejects signout without a JWT', async () => {
      const res = await authedRequest(app).post('/api/v1/auth/signout');

      expect(res.status).toBe(401);
    });
  });
});

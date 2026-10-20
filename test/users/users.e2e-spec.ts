import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DsarExportStatus } from '@prisma/client';

import { PrismaService } from '@infrastructure/database/prisma.service';
import { GcpStorageService } from '@infrastructure/storage/gcp-storage.service';
import { UsersModule } from '@modules/users/users.module';

import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

// Mock Supabase SDK so ChatsModule dependency does not require external credentials
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  }),
}));

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let validJwt: string;
  let testUserId: string;

  beforeAll(async () => {
    // Mock GCS signed URL generation so real credentials are not required
    jest
      .spyOn(GcpStorageService.prototype, 'getSignedDownloadUrl')
      .mockResolvedValue(
        'https://storage.googleapis.com/test-bucket/export.zip?signature=mock',
      );

    const context = await createAuthTestApp([UsersModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);

    // Seed test user
    const user = await prisma.user.create({ data: {} });
    testUserId = user.id;
    allCreatedUserIds.push(user.id);

    validJwt = jwtService.sign(
      {
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      },
      { secret: configService.get<string>('JWT_SECRET') || 'test-secret' },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupTestUsers(prisma, allCreatedUserIds);
    }
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    // Clear created exports between individual tests for state isolation
    if (prisma) {
      await prisma.dsarExport.deleteMany({
        where: { userId: testUserId },
      });
    }
    jest.clearAllMocks();
  });

  describe('POST /api/v1/users/me/export', () => {
    it('rejects unauthenticated request (401)', async () => {
      // Act
      const res = await authedRequest(app).post('/api/v1/users/me/export');

      // Assert
      expect(res.status).toBe(401);
    });

    it('rejects request with invalid passphrase (too short) (400)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ passphrase: 'short' });

      // Assert
      expect(res.status).toBe(400);
    });

    it('rejects unexpected fields (mass-assignment protection) (400)', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          passphrase: 'ValidPassphrase123!',
          maliciousField: 'exploit',
        });

      // Assert
      expect(res.status).toBe(400);
    });

    it('initiates data export with generated passphrase and returns 202 Accepted', async () => {
      // Act
      const res = await authedRequest(app)
        .post('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`)
        .send({});

      // Assert
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        userId: testUserId,
        status: DsarExportStatus.PENDING,
        downloadUrl: null,
      });
      expect(typeof res.body.passphrase).toBe('string');
      expect(res.body.passphrase.length).toBeGreaterThan(0);
      expect(res.body.id).toBeDefined();

      const dbRecord = await prisma.dsarExport.findUnique({
        where: { id: res.body.id },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.status).toBe(DsarExportStatus.PENDING);
    });

    it('initiates data export with custom passphrase (202 Accepted)', async () => {
      // Arrange
      const customPassphrase = 'CustomUserPassphrase2026!';

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`)
        .send({ passphrase: customPassphrase });

      // Assert
      expect(res.status).toBe(202);
      expect(res.body.passphrase).toBe(customPassphrase);
      expect(res.body.status).toBe(DsarExportStatus.PENDING);
    });

    it('rejects concurrent request when an export is already PENDING (409 Conflict)', async () => {
      // Arrange: create an existing pending export in database
      await prisma.dsarExport.create({
        data: {
          userId: testUserId,
          status: DsarExportStatus.PENDING,
          requestedAt: new Date(),
        },
      });

      // Act
      const res = await authedRequest(app)
        .post('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`)
        .send({});

      // Assert
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/v1/users/me/export', () => {
    it('rejects unauthenticated request (401)', async () => {
      // Act
      const res = await authedRequest(app).get('/api/v1/users/me/export');

      // Assert
      expect(res.status).toBe(401);
    });

    it('returns 404 when user has no data export requests', async () => {
      // Act
      const res = await authedRequest(app)
        .get('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`);

      // Assert
      expect(res.status).toBe(404);
    });

    it('returns latest export status and downloadUrl when COMPLETED (200)', async () => {
      // Arrange: create a completed export within retention period
      const completedExport = await prisma.dsarExport.create({
        data: {
          userId: testUserId,
          status: DsarExportStatus.COMPLETED,
          storagePath: `exports/${testUserId}/export.zip`,
          fileSizeBytes: 2048,
          checksumSha256: 'mock-sha256-checksum',
          requestedAt: new Date(Date.now() - 3600 * 1000),
          completedAt: new Date(Date.now() - 3500 * 1000),
          expiresAt: new Date(Date.now() + 6 * 24 * 3600 * 1000),
        },
      });

      // Act
      const res = await authedRequest(app)
        .get('/api/v1/users/me/export')
        .set('authorization', `Bearer ${validJwt}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: completedExport.id,
        userId: testUserId,
        status: DsarExportStatus.COMPLETED,
        fileSizeBytes: 2048,
        checksumSha256: 'mock-sha256-checksum',
        downloadUrl:
          'https://storage.googleapis.com/test-bucket/export.zip?signature=mock',
      });
      // Passphrase must never be returned on GET
      expect(res.body.passphrase).toBeNull();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PreferencesModule } from '@modules/preferences/preferences.module';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { authedRequest } from '../helpers/request.helper';

describe('PreferencesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const allCreatedUserIds: string[] = [];
  let seededUserId: string;
  let validJwt: string;

  beforeAll(async () => {
    const context = await createAuthTestApp([PreferencesModule]);
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  describe('Preferences Endpoints', () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          notificationPreference: {
            create: {},
          },
        },
      });
      seededUserId = user.id;
      allCreatedUserIds.push(user.id);

      validJwt = jwtService.sign({
        sub: user.id,
        iss: configService.get<string>('JWT_ISSUER'),
        aud: configService.get<string>('JWT_AUDIENCE'),
      });
    });

    it('GET /api/v1/preferences - returns default preferences', async () => {
      const res = await authedRequest(app)
        .get('/api/v1/preferences')
        .set('authorization', `Bearer ${validJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        pushEnabled: true,
        whatsappEnabled: true,
        smsEnabled: true,
        emailEnabled: true,
      });
    });

    it('PATCH /api/v1/preferences - updates preferences', async () => {
      const res = await authedRequest(app)
        .patch('/api/v1/preferences')
        .set('authorization', `Bearer ${validJwt}`)
        .send({
          pushEnabled: false,
          smsEnabled: false,
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        pushEnabled: false,
        whatsappEnabled: true,
        smsEnabled: false,
        emailEnabled: true,
      });

      // Verify database
      const prefInDb = await prisma.notificationPreference.findUnique({
        where: { userId: seededUserId },
      });
      expect(prefInDb?.pushEnabled).toBe(false);
      expect(prefInDb?.smsEnabled).toBe(false);
      expect(prefInDb?.whatsappEnabled).toBe(true);
    });
  });
});

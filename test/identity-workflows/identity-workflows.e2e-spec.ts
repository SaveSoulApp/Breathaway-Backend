import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { IdentityWorkflowsModule } from '@modules/identity-workflows/identity-workflows.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';
import { OtpService } from '@modules/one-time-passwords/one-time-passwords.service';
import { SocialidentityService } from '@modules/social-identities/social-identities.service';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { createAuthTestApp } from '../helpers/app-test.helper';
import request from 'supertest';
import { PubSubEvent } from '@modules/pubsub/enums';
import { IdentityType, LikeStatus, IntentType } from '@prisma/client';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';

describe('IdentityWorkflows (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let prisma: PrismaService;
  let otpService: OtpService;
  let socialidentityService: SocialidentityService;
  let notificationsService: NotificationsService;
  let crypto: IdentityCryptoService;
  let validToken: string;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([
      PubSubModule,
      IdentityWorkflowsModule,
    ]);
    app = context.app;
    configService = app.get(ConfigService);
    prisma = context.prisma;
    otpService = app.get(OtpService);
    socialidentityService = app.get(SocialidentityService);
    notificationsService = app.get(NotificationsService);
    crypto = app.get(IdentityCryptoService);

    validToken =
      configService.get<string>('PUBSUB_VERIFICATION_TOKEN') ||
      'test-PUBSUB_VERIFICATION_TOKEN';

    jest.spyOn(notificationsService, 'dispatch').mockResolvedValue();
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const triggerPubSubEvent = async (eventType: string, data: any) => {
    const payload = {
      message: {
        messageId: 'test-msg-' + Date.now(),
        attributes: { eventType },
        data: Buffer.from(JSON.stringify(data)).toString('base64'),
      },
      subscription: 'projects/test/subscriptions/test',
    };
    return request(app.getHttpServer())
      .post(`/api/v1/pubsub/ingest?token=${validToken}`)
      .send(payload);
  };

  describe('handleInstagramOtpReceived', () => {
    it('should verify OTP, claim identity, and dispatch notification', async () => {
      const user = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(user.id);

      const { otp } = await otpService.generateAndStoreOtp(user.id);

      const senderId = 'ig-sender-123';
      const username = 'test_ig_user';
      jest
        .spyOn(socialidentityService, 'verifyInstagramIdentity')
        .mockResolvedValueOnce({
          id: senderId,
          username,
          platform: 'instagram',
        } as any);

      const res = await triggerPubSubEvent(PubSubEvent.INSTAGRAM_OTP_RECEIVED, {
        otp,
        senderId,
        timestamp: new Date().toISOString(),
      });

      expect(res.status).toBe(200);

      const hash = await crypto.computeHash(username);
      const identity = await prisma.identity.findFirst({
        where: {
          userId: user.id,
          type: IdentityType.INSTAGRAM,
          publicValueHash: hash,
        },
      });
      expect(identity).toBeDefined();

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: [user.id],
          title: 'Identity Claimed',
        }),
      );
    });
  });

  describe('handleIdentityClaimed', () => {
    it('should backfill targetUserId on pending likes and resolve matches', async () => {
      const targetUser = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(targetUser.id);

      const targetIdentity = await prisma.identity.create({
        data: {
          type: IdentityType.INSTAGRAM,
          publicValueHash: await crypto.computeHash('target_ig'),
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          userId: targetUser.id,
          isVerified: true,
        },
      });

      const senderUser = await prisma.user.create({ data: {} });
      allCreatedUserIds.push(senderUser.id);

      const like = await prisma.like.create({
        data: {
          senderUserId: senderUser.id,
          targetIdentityId: targetIdentity.id,
          targetUserId: null,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const res = await triggerPubSubEvent(PubSubEvent.IDENTITY_CLAIMED, {
        userId: targetUser.id,
      });

      expect(res.status).toBe(200);

      const updatedLike = await prisma.like.findUnique({
        where: { id: like.id },
      });
      expect(updatedLike?.targetUserId).toBe(targetUser.id);
      expect(updatedLike?.status).toBe(LikeStatus.PENDING);
    });
  });
});

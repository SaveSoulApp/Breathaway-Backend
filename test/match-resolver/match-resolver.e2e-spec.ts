import { INestApplication } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { MatchResolverModule } from '@modules/match-resolver/match-resolver.module';
import { MatchResolverService } from '@modules/match-resolver/match-resolver.service';
import { createAuthTestApp } from '../helpers/app-test.helper';
import { cleanupTestUsers } from '../helpers/db-cleanup.helper';
import {
  IntentType,
  LikeStatus,
  MatchStatus,
  IdentityType,
} from '@prisma/client';

describe('MatchResolverService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let matchResolverService: MatchResolverService;

  const allCreatedUserIds: string[] = [];

  beforeAll(async () => {
    const context = await createAuthTestApp([MatchResolverModule]);
    app = context.app;
    prisma = context.prisma;
    matchResolverService = app.get(MatchResolverService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma, allCreatedUserIds);
    await app.close();
  });

  const createUserWithIdentity = async (identitySuffix: string) => {
    const user = await prisma.user.create({ data: {} });
    allCreatedUserIds.push(user.id);
    const requireCrypto = require('crypto');
    const identity = await prisma.identity.create({
      data: {
        type: IdentityType.PHONE,
        publicValueHash: requireCrypto.randomBytes(32).toString('hex'),
        publicValueCiphertext: 'x',
        publicValueIv: 'x',
        publicValueTag: 'x',
        publicValueWrappedKey: 'x',
        publicValueKeyId: 'key-v1',
        userId: user.id,
      },
    });
    return { user, identity };
  };

  describe('resolveFromLike', () => {
    it('should skip if targetIdentity.userId is null (unresolved ghost identity)', async () => {
      const { user: sender } = await createUserWithIdentity('sender-no-target');
      // Create a ghost identity with no owner
      const requireCrypto = require('crypto');
      const ghostIdentity = await prisma.identity.create({
        data: {
          type: IdentityType.PHONE,
          publicValueHash: requireCrypto.randomBytes(32).toString('hex'),
          publicValueCiphertext: 'x',
          publicValueIv: 'x',
          publicValueTag: 'x',
          publicValueWrappedKey: 'x',
          publicValueKeyId: 'key-v1',
          userId: null,
        },
      });

      const like = await prisma.like.create({
        data: {
          senderUserId: sender.id,
          targetIdentityId: ghostIdentity.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await matchResolverService.resolveFromLike({
        id: like.id,
        senderUserId: like.senderUserId,
        targetIdentityId: like.targetIdentityId,
        intent: like.intent,
        label: like.label,
        status: like.status,
        targetIdentity: { userId: null },
      });

      const updatedLike = await prisma.like.findUnique({
        where: { id: like.id },
      });
      expect(updatedLike?.status).toBe(LikeStatus.PENDING);
    });

    it('should skip if no reverse like is found', async () => {
      const { user: sender } = await createUserWithIdentity('sender-no-rev');
      const { user: target, identity: targetIdentity } =
        await createUserWithIdentity('target-no-rev');

      const like = await prisma.like.create({
        data: {
          senderUserId: sender.id,
          targetIdentityId: targetIdentity.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await matchResolverService.resolveFromLike({
        id: like.id,
        senderUserId: like.senderUserId,
        targetIdentityId: like.targetIdentityId,
        intent: like.intent,
        label: like.label,
        status: like.status,
        targetIdentity: { userId: target.id },
      });

      const updatedLike = await prisma.like.findUnique({
        where: { id: like.id },
      });
      expect(updatedLike?.status).toBe(LikeStatus.PENDING);

      const matches = await prisma.match.findMany({
        where: { userOneId: sender.id, userTwoId: target.id },
      });
      expect(matches).toHaveLength(0);
    });

    it('should create a match when a valid reverse like exists', async () => {
      const { user: userA, identity: identityA } =
        await createUserWithIdentity('userA-match');
      const { user: userB, identity: identityB } =
        await createUserWithIdentity('userB-match');

      const likeFromA = await prisma.like.create({
        data: {
          senderUserId: userA.id,
          targetIdentityId: identityB.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const likeFromB = await prisma.like.create({
        data: {
          senderUserId: userB.id,
          targetIdentityId: identityA.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      // Resolve the second like (from B to A)
      await matchResolverService.resolveFromLike({
        id: likeFromB.id,
        senderUserId: likeFromB.senderUserId,
        targetIdentityId: likeFromB.targetIdentityId,
        intent: likeFromB.intent,
        label: likeFromB.label,
        status: likeFromB.status,
        targetIdentity: { userId: userA.id },
      });

      const updatedLikeA = await prisma.like.findUnique({
        where: { id: likeFromA.id },
      });
      const updatedLikeB = await prisma.like.findUnique({
        where: { id: likeFromB.id },
      });

      expect(updatedLikeA?.status).toBe(LikeStatus.MATCHED);
      expect(updatedLikeB?.status).toBe(LikeStatus.MATCHED);

      const [userOneId, userTwoId] = [userA.id, userB.id].sort();
      const match = await prisma.match.findFirst({
        where: { userOneId, userTwoId },
      });

      expect(match).toBeDefined();
      expect(match?.status).toBe(MatchStatus.ACTIVE);

      const canonicalLikeOneId =
        userOneId === userA.id ? likeFromA.id : likeFromB.id;
      const canonicalLikeTwoId =
        userTwoId === userB.id ? likeFromB.id : likeFromA.id;

      expect(match?.likeOneId).toBe(canonicalLikeOneId);
      expect(match?.likeTwoId).toBe(canonicalLikeTwoId);
    });

    it('should prevent match if users are blocked', async () => {
      const { user: userA, identity: identityA } =
        await createUserWithIdentity('userA-blocked');
      const { user: userB, identity: identityB } =
        await createUserWithIdentity('userB-blocked');

      await prisma.block.create({
        data: {
          blockerUserId: userA.id,
          blockedUserId: userB.id,
        },
      });

      await prisma.like.create({
        data: {
          senderUserId: userA.id,
          targetIdentityId: identityB.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const likeFromB = await prisma.like.create({
        data: {
          senderUserId: userB.id,
          targetIdentityId: identityA.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await matchResolverService.resolveFromLike({
        id: likeFromB.id,
        senderUserId: likeFromB.senderUserId,
        targetIdentityId: likeFromB.targetIdentityId,
        intent: likeFromB.intent,
        label: likeFromB.label,
        status: likeFromB.status,
        targetIdentity: { userId: userA.id },
      });

      const match = await prisma.match.findFirst({
        where: {
          OR: [
            { userOneId: userA.id, userTwoId: userB.id },
            { userOneId: userB.id, userTwoId: userA.id },
          ],
        },
      });

      expect(match).toBeNull();
    });

    it('should prevent match if intents are incompatible', async () => {
      const { user: userA, identity: identityA } =
        await createUserWithIdentity('userA-incompat');
      const { user: userB, identity: identityB } =
        await createUserWithIdentity('userB-incompat');

      await prisma.like.create({
        data: {
          senderUserId: userA.id,
          targetIdentityId: identityB.id,
          intent: IntentType.RELATIONSHIP,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const likeFromB = await prisma.like.create({
        data: {
          senderUserId: userB.id,
          targetIdentityId: identityA.id,
          intent: IntentType.CASUAL,
          status: LikeStatus.PENDING,
          label: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await matchResolverService.resolveFromLike({
        id: likeFromB.id,
        senderUserId: likeFromB.senderUserId,
        targetIdentityId: likeFromB.targetIdentityId,
        intent: likeFromB.intent,
        label: likeFromB.label,
        status: likeFromB.status,
        targetIdentity: { userId: userA.id },
      });

      const match = await prisma.match.findFirst({
        where: {
          OR: [
            { userOneId: userA.id, userTwoId: userB.id },
            { userOneId: userB.id, userTwoId: userA.id },
          ],
        },
      });

      // RELATIONSHIP and CASUAL are incompatible — no match expected.
      expect(match).toBeNull();
    });
  });
});

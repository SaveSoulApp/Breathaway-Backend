import { PrismaService } from '@infrastructure/database/prisma.service';

/**
 * Deletes test-created rows in correct FK order to avoid constraint violations.
 *
 * Call this in `afterAll` (or `afterEach` for isolated tests), passing only the
 * user IDs that were created by the test suite.
 */
export async function cleanupTestUsers(
  prisma: PrismaService,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;

  // Delete in FK dependency order: child tables first
  await prisma.transaction.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userSubscription.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.match.deleteMany({
    where: {
      OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }],
    },
  });
  await prisma.block.deleteMany({
    where: {
      OR: [
        { blockerUserId: { in: userIds } },
        { blockedUserId: { in: userIds } },
      ],
    },
  });
  await prisma.like.deleteMany({
    where: {
      senderUserId: { in: userIds },
    },
  });
  await prisma.creditLedger.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.device.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userProfile.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.authCredential.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.identity.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Deletes identities that were created without a userId (e.g. orphaned social identities).
 * Pass the identity IDs to remove.
 */
export async function cleanupOrphanedIdentities(
  prisma: PrismaService,
  identityIds: string[],
): Promise<void> {
  if (identityIds.length === 0) return;
  await prisma.identity.deleteMany({ where: { id: { in: identityIds } } });
}

/**
 * Cleans up test-created subscription plans and their price entries.
 * Deletes any userSubscriptions referencing the plan first to avoid FK violations.
 */
export async function cleanupTestSubscriptionPlans(
  prisma: PrismaService,
  planIds: string[],
): Promise<void> {
  if (planIds.length === 0) return;
  await prisma.userSubscription.deleteMany({
    where: { planId: { in: planIds } },
  });
  await prisma.subscriptionPlanPrice.deleteMany({
    where: { planId: { in: planIds } },
  });
  await prisma.subscriptionPlan.deleteMany({
    where: { id: { in: planIds } },
  });
}

/**
 * Cleans up test-created transactions.
 */
export async function cleanupTestTransactions(
  prisma: PrismaService,
  transactionIds: string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  await prisma.transaction.deleteMany({
    where: { id: { in: transactionIds } },
  });
}

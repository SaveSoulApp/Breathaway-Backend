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
  await prisma.match.deleteMany({
    where: { OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }] },
  });
  await prisma.block.deleteMany({
    where: { OR: [{ blockerUserId: { in: userIds } }, { blockedUserId: { in: userIds } }] },
  });
  await prisma.like.deleteMany({
    where: { OR: [{ senderUserId: { in: userIds } }, { targetUserId: { in: userIds } }] },
  });
  await prisma.authCredential.deleteMany({ where: { userId: { in: userIds } } });
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

import * as fs from 'fs';
import * as path from 'path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { SessionManifest } from './setup';

const SESSION_FILE_PATH = path.resolve(
  __dirname,
  '../../test/load/.test-session.json',
);

async function runCleanup(): Promise<void> {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      '❌ Error: DATABASE_URL or DIRECT_URL environment variable is required to run cleanup.',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('🧹 Initializing Load Test Database Cleanup...');

  try {
    const targetUserIds = new Set<string>();
    const targetIdentityIds = new Set<string>();

    // 1. Recover IDs from manifest if file exists
    if (fs.existsSync(SESSION_FILE_PATH)) {
      try {
        const content = fs.readFileSync(SESSION_FILE_PATH, 'utf-8');
        const manifest: SessionManifest = JSON.parse(content);
        for (const u of manifest.users) {
          if (u.userId) targetUserIds.add(u.userId);
          if (u.identityId) targetIdentityIds.add(u.identityId);
        }
      } catch (err) {
        console.warn(
          '⚠️ Could not parse existing manifest file, falling back to database scan.',
          err,
        );
      }
    }

    // 2. Discover any additional test users matching LoadTest_ pattern
    const discoveredUsers = await prisma.user.findMany({
      where: {
        profile: {
          firstName: { startsWith: 'LoadTest_' },
        },
      },
      select: {
        id: true,
        identities: { select: { id: true } },
      },
    });

    for (const u of discoveredUsers) {
      targetUserIds.add(u.id);
      for (const ident of u.identities) {
        targetIdentityIds.add(ident.id);
      }
    }

    const userIds = Array.from(targetUserIds);
    const identityIds = Array.from(targetIdentityIds);

    if (userIds.length === 0) {
      console.log(
        '✨ No benchmark test users found in database. Nothing to clean.',
      );
      if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH);
      }
      return;
    }

    console.log(
      `🗑️ Found ${userIds.length} test users to purge. Deleting relations in FK order...`,
    );

    // 3. Foreign Key Ordered Cascade Purge
    const payments = await prisma.paymentOrder.deleteMany({
      where: { userId: { in: userIds } },
    });
    const notifs = await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    const txs = await prisma.transaction.deleteMany({
      where: { userId: { in: userIds } },
    });
    const subs = await prisma.userSubscription.deleteMany({
      where: { userId: { in: userIds } },
    });
    const msgs = await prisma.message.deleteMany({
      where: { senderUserId: { in: userIds } },
    });
    const chats = await prisma.chatRoom.deleteMany({
      where: {
        OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }],
      },
    });
    const matches = await prisma.match.deleteMany({
      where: {
        OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }],
      },
    });
    const blocks = await prisma.block.deleteMany({
      where: {
        OR: [
          { blockerUserId: { in: userIds } },
          { blockedUserId: { in: userIds } },
        ],
      },
    });
    const likes = await prisma.like.deleteMany({
      where: {
        OR: [
          { senderUserId: { in: userIds } },
          { targetIdentityId: { in: identityIds } },
        ],
      },
    });
    const credits = await prisma.creditLedger.deleteMany({
      where: { userId: { in: userIds } },
    });
    const devices = await prisma.device.deleteMany({
      where: { userId: { in: userIds } },
    });
    const sessions = await prisma.userSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    const notifPrefs = await prisma.notificationPreference.deleteMany({
      where: { userId: { in: userIds } },
    });
    const consents = await prisma.consentLedger.deleteMany({
      where: { userId: { in: userIds } },
    });
    const profiles = await prisma.userProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    const creds = await prisma.authCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    const dsars = await prisma.dsarExport.deleteMany({
      where: { userId: { in: userIds } },
    });
    const idents = await prisma.identity.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { id: { in: identityIds } }],
      },
    });
    const users = await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    // 4. Remove manifest file
    if (fs.existsSync(SESSION_FILE_PATH)) {
      fs.unlinkSync(SESSION_FILE_PATH);
    }

    console.log('✅ Cleanup Completed Successfully:');
    console.log(`   - Users removed: ${users.count}`);
    console.log(`   - Profiles removed: ${profiles.count}`);
    console.log(`   - Identities removed: ${idents.count}`);
    console.log(`   - Likes purged: ${likes.count}`);
    console.log(`   - Matches purged: ${matches.count}`);
    console.log(
      `   - ChatRooms / Messages purged: ${chats.count + msgs.count}`,
    );
    console.log(
      `   - Sessions / Credits purged: ${sessions.count + credits.count}`,
    );
    console.log('🎉 Supabase database is 100% clean and restored.');
  } catch (error) {
    console.error('❌ Failed during load test cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void runCleanup();

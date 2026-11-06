import * as fs from 'fs';
import * as path from 'path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { SessionManifest } from './setup';

const SESSION_FILE_PATH = path.resolve(
  __dirname,
  '../../test/load/.test-session.json',
);

/**
 * Validates that the active execution environment is safe for automated load test teardown.
 * Prevents accidental execution against production databases.
 */
function assertSafeEnvironment(databaseUrl: string): void {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const deploymentEnv = (process.env.DEPLOYMENT_ENV || '').toLowerCase();
  const allowProd =
    process.env.ALLOW_DANGEROUS_LOAD_TEST_ON_PRODUCTION === 'true';

  const isProduction =
    nodeEnv === 'production' ||
    deploymentEnv === 'prod' ||
    deploymentEnv === 'production' ||
    databaseUrl.toLowerCase().includes('prod') ||
    databaseUrl.toLowerCase().includes('production');

  if (isProduction && !allowProd) {
    console.error(
      '🚨 FATAL SAFETY ERROR: Production environment detected! Load test teardown is strictly prohibited against production databases.',
    );
    console.error(
      '   If you are 100% certain you intend to run this against production, you must explicitly set ALLOW_DANGEROUS_LOAD_TEST_ON_PRODUCTION=true.',
    );
    process.exit(1);
  }
}

/**
 * Specification for an individual table purge operation.
 * Encapsulates the Prisma query within an atomic transaction client.
 */
interface CleanupStep {
  modelName: string;
  description: string;
  execute: (
    tx: Prisma.TransactionClient,
    userIds: string[],
    identityIds: string[],
  ) => Promise<{ count: number }>;
}

/**
 * Ordered list of foreign-key dependent cleanup steps.
 * Purges child rows before parent records to prevent foreign key constraint violations.
 */
const CLEANUP_STEPS: CleanupStep[] = [
  {
    modelName: 'PaymentOrder',
    description: 'Payment orders',
    execute: (tx, userIds) =>
      tx.paymentOrder.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'Notification',
    description: 'Notifications',
    execute: (tx, userIds) =>
      tx.notification.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'Transaction',
    description: 'Transactions',
    execute: (tx, userIds) =>
      tx.transaction.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'UserSubscription',
    description: 'User subscriptions',
    execute: (tx, userIds) =>
      tx.userSubscription.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'Message',
    description: 'Chat messages',
    execute: (tx, userIds) =>
      tx.message.deleteMany({ where: { senderId: { in: userIds } } }),
  },
  {
    modelName: 'ChatRoom',
    description: 'Chat rooms',
    execute: (tx, userIds) =>
      tx.chatRoom.deleteMany({
        where: {
          OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }],
        },
      }),
  },
  {
    modelName: 'Match',
    description: 'Matches',
    execute: (tx, userIds) =>
      tx.match.deleteMany({
        where: {
          OR: [{ userOneId: { in: userIds } }, { userTwoId: { in: userIds } }],
        },
      }),
  },
  {
    modelName: 'Block',
    description: 'User blocks',
    execute: (tx, userIds) =>
      tx.block.deleteMany({
        where: {
          OR: [
            { blockerUserId: { in: userIds } },
            { blockedUserId: { in: userIds } },
          ],
        },
      }),
  },
  {
    modelName: 'Like',
    description: 'Sent & received likes',
    execute: (tx, userIds, identityIds) =>
      tx.like.deleteMany({
        where: {
          OR: [
            { senderUserId: { in: userIds } },
            { targetIdentityId: { in: identityIds } },
          ],
        },
      }),
  },
  {
    modelName: 'CreditLedger',
    description: 'Credit ledger entries',
    execute: (tx, userIds) =>
      tx.creditLedger.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'Device',
    description: 'Push notification devices',
    execute: (tx, userIds) =>
      tx.device.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'UserSession',
    description: 'User authentication sessions',
    execute: (tx, userIds) =>
      tx.userSession.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'NotificationPreference',
    description: 'Notification preferences',
    execute: (tx, userIds) =>
      tx.notificationPreference.deleteMany({
        where: { userId: { in: userIds } },
      }),
  },
  {
    modelName: 'ConsentLedger',
    description: 'GDPR consent ledger entries',
    execute: (tx, userIds) =>
      tx.consentLedger.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'UserProfile',
    description: 'User profiles',
    execute: (tx, userIds) =>
      tx.userProfile.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'AuthCredential',
    description: 'Authentication credentials',
    execute: (tx, userIds) =>
      tx.authCredential.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'DsarExport',
    description: 'DSAR export requests',
    execute: (tx, userIds) =>
      tx.dsarExport.deleteMany({ where: { userId: { in: userIds } } }),
  },
  {
    modelName: 'Identity',
    description: 'Cryptographic identities',
    execute: (tx, userIds, identityIds) =>
      tx.identity.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { id: { in: identityIds } }],
        },
      }),
  },
  {
    modelName: 'User',
    description: 'Core user accounts',
    execute: (tx, userIds) =>
      tx.user.deleteMany({ where: { id: { in: userIds } } }),
  },
];

async function runCleanup(): Promise<void> {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      '❌ Error: DATABASE_URL or DIRECT_URL environment variable is required to run cleanup.',
    );
    process.exit(1);
  }

  // Safety guard against running teardown on production database
  assertSafeEnvironment(databaseUrl);

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

    // 2. Discover any additional test users matching benchmark patterns
    const discoveredUsers = await prisma.user.findMany({
      where: {
        OR: [
          {
            profile: {
              firstName: { startsWith: 'LoadTest_' },
            },
          },
          {
            authCredentials: {
              some: {
                valueMasked: { contains: '2222' },
              },
            },
          },
        ],
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
      `🗑️ Found ${userIds.length} test users to purge. Executing atomic cascade teardown...`,
    );

    // 3. Atomic Foreign Key Ordered Cascade Purge in a single Prisma Transaction
    const purgeCounts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        for (const step of CLEANUP_STEPS) {
          const res = await step.execute(tx, userIds, identityIds);
          purgeCounts[step.modelName] = res.count;
        }
      },
      {
        timeout: 60000, // 60s timeout budget for large batch purges
      },
    );

    // 4. Remove manifest file
    if (fs.existsSync(SESSION_FILE_PATH)) {
      fs.unlinkSync(SESSION_FILE_PATH);
    }

    console.log('✅ Cleanup Completed Successfully (Atomic Transaction):');
    for (const step of CLEANUP_STEPS) {
      const count = purgeCounts[step.modelName] || 0;
      if (count > 0) {
        console.log(`   - ${step.description} removed: ${count}`);
      }
    }
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

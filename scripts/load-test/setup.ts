import { createHmac, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { GenderType, IdentityType, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

export interface TestUserSession {
  userId: string;
  identityId: string;
  phone: string;
  firstName: string;
  token: string;
}

export interface SessionManifest {
  createdAt: string;
  expiresAt: string;
  count: number;
  users: TestUserSession[];
}

const SESSION_FILE_PATH = path.resolve(
  __dirname,
  '../../test/load/.test-session.json',
);

async function runSetup(): Promise<void> {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      '❌ Error: DATABASE_URL or DIRECT_URL environment variable is required to run load test setup.',
    );
    process.exit(1);
  }

  const userCount = process.env.LOAD_TEST_USERS
    ? parseInt(process.env.LOAD_TEST_USERS, 10)
    : 20;

  console.log(
    `🚀 Initializing Load Test Setup: Creating ${userCount} benchmark accounts...`,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  const jwtAudience = process.env.JWT_AUDIENCE || 'breathaway-client';
  const jwtIssuer = process.env.JWT_ISSUER || 'breathaway-backend';
  const jwtService = new JwtService();

  const createdSessions: TestUserSession[] = [];

  try {
    for (let i = 1; i <= userCount; i++) {
      // Formats as 10-digit number starting with 2222: +912222000001
      const suffix = String(i).padStart(6, '0');
      const phone = `+912222${suffix}`;
      const firstName = `LoadTest_User_${i}`;

      // Deterministic 32-byte HMAC hash for blinded identity lookup
      const hmacKey =
        process.env.HMAC_SECRET || 'dev-hmac-secret-key-32-chars!!';
      const publicValueHash = createHmac('sha256', hmacKey)
        .update(phone)
        .digest();

      // Check if user already exists from a previous uncleaned run
      const existingIdentity = await prisma.identity.findUnique({
        where: {
          type_publicValueHash: {
            type: IdentityType.PHONE,
            publicValueHash,
          },
        },
        include: { user: true },
      });

      let userId: string;
      let identityId: string;

      if (existingIdentity && existingIdentity.user) {
        userId = existingIdentity.user.id;
        identityId = existingIdentity.id;

        // Ensure user has ample credits for load testing
        await prisma.creditLedger.create({
          data: {
            userId,
            transactionType: 'CREDIT',
            amount: 100,
            source: 'ADMIN',
          },
        });
      } else {
        // 1. Create User with Profile and Credits
        const user = await prisma.user.create({
          data: {
            countryCode: 'IN',
            profile: {
              create: {
                firstName,
                lastName: 'Benchmark',
                gender: i % 2 === 0 ? GenderType.FEMALE : GenderType.MALE,
              },
            },
            creditLedger: {
              create: {
                transactionType: 'CREDIT',
                amount: 100,
                source: 'ADMIN',
              },
            },
          },
        });
        userId = user.id;

        // 2. Create Phone Identity with envelope encryption placeholders
        const identity = await prisma.identity.create({
          data: {
            userId,
            type: IdentityType.PHONE,
            isVerified: true,
            publicValueHash,
            publicValueCiphertext: randomBytes(32),
            publicValueIv: randomBytes(12),
            publicValueTag: randomBytes(16),
            publicValueWrappedKey: randomBytes(32),
            publicValueKeyId: 'loadtest-key',
            publicValueMasked: `+91 22220 ${suffix.slice(-4)}`,
          },
        });
        identityId = identity.id;
      }

      // 3. Mint 15-minute JWT access token
      const token = jwtService.sign(
        { sub: userId },
        {
          secret: jwtSecret,
          audience: jwtAudience,
          issuer: jwtIssuer,
          expiresIn: '15m',
        },
      );

      createdSessions.push({
        userId,
        identityId,
        phone,
        firstName,
        token,
      });
    }

    const manifest: SessionManifest = {
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      count: createdSessions.length,
      users: createdSessions,
    };

    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(manifest, null, 2), {
      encoding: 'utf-8',
    });

    console.log(
      `✅ Setup Complete: ${createdSessions.length} test accounts ready.`,
    );
    console.log(`📁 Manifest written to: ${SESSION_FILE_PATH}`);
    console.log(`⏱️ Tokens expire at: ${manifest.expiresAt}`);
  } catch (error) {
    console.error('❌ Failed during load test setup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void runSetup();

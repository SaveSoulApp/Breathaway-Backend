import { AsyncLocalStorage } from 'async_hooks';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { GenderType, IdentityType, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';

import { IdentityCryptoService } from '../../src/core/identity-crypto/identity-crypto.service';
import { GcpSecretsKeyManager } from '../../src/core/kms/gcp-secrets-key-manager.service';
import { LoggerService } from '../../src/core/logger';

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
  clientHeaders: Record<string, string>;
  users: TestUserSession[];
}

const SESSION_FILE_PATH = path.resolve(
  __dirname,
  '../../test/load/.test-session.json',
);

/**
 * Resolves valid client identity headers directly from runtime environment variables.
 * Automatically aligns API key, client ID, and user-agent with ClientIdentityGuard expectations.
 */
function resolveClientIdentityHeaders(
  configService: ConfigService,
): Record<string, string> {
  let apiKey = configService.get<string>('API_KEY', '').trim();
  let clientId = configService.get<string>('CLIENT_ID', '').trim();
  let platform = configService
    .get<string>('PLATFORM', 'ios')
    .toLowerCase()
    .trim();

  // If explicit API_KEY or CLIENT_ID were not provided via environment, resolve from JSON configs
  if (!apiKey || !clientId) {
    try {
      const rawApiKeys = configService.get<string>('API_KEYS', '{}');
      const parsedApiKeys = JSON.parse(rawApiKeys.replace(/^['"]|['"]$/g, ''));
      for (const [plt, keys] of Object.entries(parsedApiKeys)) {
        if (Array.isArray(keys) && keys.length > 0) {
          if (!apiKey) {
            platform = plt.toLowerCase();
            apiKey = String(keys[0]);
          }
          break;
        }
      }
    } catch {
      // Fallback to defaults
    }

    try {
      const rawClientIds = configService.get<string>('CLIENT_IDS', '{}');
      const parsedClientIds = JSON.parse(
        rawClientIds.replace(/^['"]|['"]$/g, ''),
      );
      if (
        Array.isArray(parsedClientIds[platform]) &&
        parsedClientIds[platform].length > 0
      ) {
        clientId = String(parsedClientIds[platform][0]);
      } else {
        for (const keys of Object.values(parsedClientIds)) {
          if (Array.isArray(keys) && keys.length > 0) {
            clientId = String(keys[0]);
            break;
          }
        }
      }
    } catch {
      // Fallback to defaults
    }
  }

  const appName = configService.get<string>('APP_NAME', 'BreathAway');
  const minVersion = configService.get<string>('MIN_APP_VERSION', '1.0.0');
  const formattedPlatform =
    platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Postman';

  return {
    'x-api-key': apiKey || 'test-api-key',
    'x-client-id': clientId || 'test-client-id',
    'x-device-id': 'loadtest-device-runner',
    'x-user-agent': `${appName}/${minVersion} (${formattedPlatform} 17.0; LoadTestRunner)`,
    'x-timezone': 'UTC',
  };
}

/**
 * Validates that the active execution environment is safe for automated load testing.
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
      '🚨 FATAL SAFETY ERROR: Production environment detected! Load test setup is strictly prohibited against production databases.',
    );
    console.error(
      '   If you are 100% certain you intend to run this against production, you must explicitly set ALLOW_DANGEROUS_LOAD_TEST_ON_PRODUCTION=true.',
    );
    process.exit(1);
  }
}

async function runSetup(): Promise<void> {
  const configService = new ConfigService();
  const databaseUrl =
    configService.get<string>('DIRECT_URL') ||
    configService.get<string>('DATABASE_URL');

  if (!databaseUrl) {
    console.error(
      '❌ Error: DATABASE_URL or DIRECT_URL environment variable is required to run load test setup.',
    );
    process.exit(1);
  }

  // Safety guard against running load test against production database
  assertSafeEnvironment(databaseUrl);

  const rawUserCount =
    process.env.LOAD_TEST_USERS || process.env.USERS || process.env.VUS;
  const userCount = rawUserCount ? parseInt(rawUserCount, 10) : 20;

  // Dynamic connection pool sizing check & advisory warning
  const rawPoolMax = process.env.DB_POOL_MAX;
  const dbPoolMax = rawPoolMax ? parseInt(rawPoolMax, 10) : 10;

  if (userCount > dbPoolMax * 2) {
    console.warn(
      `⚠️ Connection Pool Advisory: LOAD_TEST_USERS (${userCount}) is significantly higher than DB_POOL_MAX (${dbPoolMax}).`,
    );
    console.warn(
      `   Under heavy concurrent execution, this may lead to pool checkout contention or socket exhaustion.`,
    );
    console.warn(
      `   Recommended: Export DB_POOL_MAX=${Math.min(userCount, 50)} when running high-VU benchmarks.`,
    );
  }

  console.log(
    `🚀 Initializing Load Test Setup: Creating ${userCount} benchmark accounts...`,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const clsService = new ClsService(new AsyncLocalStorage());
  const loggerService = new LoggerService(configService, clsService);
  const keyManager = new GcpSecretsKeyManager(configService);
  const cryptoService = new IdentityCryptoService(loggerService, keyManager);

  const jwtSecret = configService.get<string>(
    'JWT_SECRET',
    'dev_jwt_secret_change_me',
  );
  const jwtAudience = configService.get<string>(
    'JWT_AUDIENCE',
    'breathaway-mobile-app',
  );
  const jwtIssuer = configService.get<string>(
    'JWT_ISSUER',
    'https://dev.breathaway.app',
  );
  const jwtService = new JwtService();

  const createdSessions: TestUserSession[] = [];

  try {
    for (let i = 1; i <= userCount; i++) {
      // Formats as 10-digit number starting with 2222: +912222000001
      const suffix = String(i).padStart(6, '0');
      const phone = `+912222${suffix}`;
      const firstName = `LoadTest_User_${i}`;

      // Cryptographically process phone identity through project KMS envelope
      const publicValueData = await cryptoService.processPublicValue(
        phone,
        IdentityType.PHONE,
      );

      const hashBuffer = Buffer.from(publicValueData.publicValueHash);

      // Check if identity already exists from a prior setup
      const existingIdentity = await prisma.identity.findFirst({
        where: {
          type: IdentityType.PHONE,
          publicValueHash: hashBuffer,
        },
        include: { user: true },
      });

      let userId: string;
      let identityId: string;

      if (existingIdentity && existingIdentity.user) {
        userId = existingIdentity.user.id;
        identityId = existingIdentity.id;

        // Ensure user has ample credits for sending likes during benchmark
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

        // 2. Create Phone Identity with valid AES-GCM envelope encryption
        const identity = await prisma.identity.create({
          data: {
            userId,
            type: IdentityType.PHONE,
            isVerified: true,
            publicValueHash: hashBuffer,
            publicValueCiphertext: Buffer.from(
              publicValueData.publicValueCiphertext,
            ),
            publicValueIv: Buffer.from(publicValueData.publicValueIv),
            publicValueTag: Buffer.from(publicValueData.publicValueTag),
            publicValueWrappedKey: Buffer.from(
              publicValueData.publicValueWrappedKey,
            ),
            publicValueKeyId: publicValueData.publicValueKeyId,
            publicValueMasked: publicValueData.publicValueMasked,
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

    const clientHeaders = resolveClientIdentityHeaders(configService);

    const manifest: SessionManifest = {
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      count: createdSessions.length,
      clientHeaders,
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

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
  let apiKey = configService.get<string>('API_KEY', '');
  let clientId = configService.get<string>('CLIENT_ID', '');
  let platform = 'ios';

  try {
    const rawApiKeys = configService.get<string>('API_KEYS', '{}');
    const parsedApiKeys = JSON.parse(rawApiKeys.replace(/^['"]|['"]$/g, ''));
    for (const [plt, keys] of Object.entries(parsedApiKeys)) {
      if (Array.isArray(keys) && keys.length > 0) {
        platform = plt.toLowerCase();
        apiKey = String(keys[0]);
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

  const userCount = process.env.LOAD_TEST_USERS
    ? parseInt(process.env.LOAD_TEST_USERS, 10)
    : 20;

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

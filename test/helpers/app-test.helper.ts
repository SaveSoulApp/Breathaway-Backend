import { randomUUID } from 'crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule, ClsService } from 'nestjs-cls';

import { ClientIdentityGuard } from '@common/guards/client-identity.guard';
import { GlobalExceptionFilter } from '@core/exception-filters/global-exception.filter';
import { LoggerModule, LoggerService } from '@core/logger';
import { AppValidationPipe } from '@core/pipes';
import { PrismaExceptionFilter } from '@infrastructure/database/exception-filters/prisma-exception.filter';
import { PrismaModule } from '@infrastructure/database/prisma.module';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthMethod } from '@modules/auth/utils/auth-method.utils';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { FirebaseService } from '@modules/firebase/firebase.service';
import type { FirebaseValidationResult } from '@modules/firebase/firebase.service';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

class InMemoryRedisClient {
  private store = new Map<string, { val: string; expiresAt?: number }>();

  async set(
    key: string,
    value: string,
    mode?: string,
    duration?: number,
  ): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && typeof duration === 'number') {
      expiresAt = Date.now() + duration * 1000;
    }
    this.store.set(key, { val: String(value), expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.val;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiresAt) return -1;
    const rem = Math.ceil((item.expiresAt - Date.now()) / 1000);
    return rem > 0 ? rem : -2;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  disconnect(): void {}
}

export interface AppTestContext {
  app: INestApplication;
  prisma: PrismaService;
  mockFirebaseValidation: jest.Mock<Promise<FirebaseValidationResult>>;
}

/**
 * Builds a fully-bootstrapped NestJS test application scoped to the AuthModule.
 *
 * Firebase is replaced with a controllable mock so tests are not coupled to
 * real Firebase tokens. All other dependencies (Prisma, KMS, JWT) run against
 * the real .env.test configuration.
 */
export async function createAuthTestApp(
  extraModules: any[] = [],
): Promise<AppTestContext> {
  // Ensure required test environment variables are populated
  process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass';
  process.env.GCP_OIDC_AUDIENCE =
    process.env.GCP_OIDC_AUDIENCE ||
    'https://backend-service-at7g3x4m6q-el.a.run.app';

  // Prevent actual GCP PubSub calls
  jest
    .spyOn(PubSubPublisherService.prototype, 'publish')
    .mockResolvedValue('mock-message-id');

  const mockFirebaseValidation = jest.fn<
    Promise<FirebaseValidationResult>,
    [string, string]
  >();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        // .env.test is loaded by globalSetup before any module boots
        envFilePath: `.env.test`,
        cache: false,
      }),
      ThrottlerModule.forRootAsync({
        useFactory: () => [
          { name: 'short', ttl: seconds(1), limit: 100 },
          { name: 'medium', ttl: seconds(10), limit: 200 },
          { name: 'long', ttl: seconds(60), limit: 500 },
        ],
      }),
      LoggerModule,
      PrismaModule,
      FirebaseModule,
      AuthModule,
      PubSubModule,
      ClsModule.forRoot({
        global: true,
        middleware: {
          mount: true,
          setup: (cls, req: any) => {
            cls.set('requestStart', Date.now());
            cls.set('ipAddress', req.ip);
            cls.set('userAgent', req.headers?.['x-user-agent']);

            const requestId = req.headers?.['x-request-id'] || randomUUID();
            cls.set('requestId', requestId);

            const traceContext = req.headers?.['x-cloud-trace-context'];
            if (traceContext) {
              cls.set('traceContext', traceContext);
            }
          },
        },
      }),
      EventEmitterModule.forRoot(),
      ...extraModules,
    ],
    providers: [
      {
        provide: APP_GUARD,
        useClass: ClientIdentityGuard,
      },
    ],
  })
    .overrideProvider(FirebaseService)
    .useValue({
      validateFirebaseToken: mockFirebaseValidation,
      onModuleInit: jest.fn(),
      getMessaging: jest.fn(),
    })
    .overrideProvider(PubSubPublisherService)
    .useValue({
      publish: jest.fn().mockResolvedValue('mock-message-id'),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    })
    .overrideProvider('REDIS_CLIENT')
    .useValue(new InMemoryRedisClient())
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });

  // Mirror main.ts bootstrap
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Suppress expected 4xx HTTP exception logs from the global filter during tests
  const originalForContext = logger.forContext.bind(logger);
  jest.spyOn(logger, 'forContext').mockImplementation((context: string) => {
    const contextualLogger = originalForContext(context);
    if (
      context === 'GlobalExceptionFilter' ||
      context === 'PrismaExceptionFilter'
    ) {
      const originalError = contextualLogger.error.bind(contextualLogger);
      contextualLogger.error = (
        message: unknown,
        meta?: Record<string, unknown>,
      ) => {
        if (
          meta &&
          typeof meta.statusCode === 'number' &&
          meta.statusCode >= 400 &&
          meta.statusCode < 500
        ) {
          return;
        }
        originalError(message, meta);
      };
    }
    return contextualLogger;
  });

  app.useGlobalFilters(
    new GlobalExceptionFilter(
      logger,
      app.get(ConfigService),
      app.get(ClsService),
    ),
    new PrismaExceptionFilter(logger, app.get(ClsService)),
  );
  app.useGlobalPipes(new AppValidationPipe());
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  await app.init();

  const prisma = moduleFixture.get(PrismaService);

  return { app, prisma, mockFirebaseValidation };
}

/**
 * Builds a mock FirebaseValidationResult for phone authentication.
 */
export function mockPhoneFirebaseToken(
  phoneNumber: string,
  isVerified = true,
): FirebaseValidationResult {
  return {
    decodedToken: {
      uid: 'test-firebase-uid',
      phone_number: phoneNumber,
      firebase: { sign_in_provider: 'phone' },
    } as never,
    authMethod: {
      method: AuthMethod.PHONE,
      identifier: phoneNumber,
      isVerified,
    },
  };
}

/**
 * Builds a mock FirebaseValidationResult for email/password authentication.
 */
export function mockEmailFirebaseToken(
  email: string,
  isVerified = true,
): FirebaseValidationResult {
  return {
    decodedToken: {
      uid: 'test-firebase-uid',
      email,
      email_verified: isVerified,
      firebase: { sign_in_provider: 'password' },
    } as never,
    authMethod: {
      method: AuthMethod.EMAIL,
      identifier: email,
      isVerified,
    },
  };
}

/**
 * Generates a valid Basic Auth header value from username:password.
 */
export function buildBasicAuthHeader(
  username: string,
  password: string,
): string {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Reads the dev login credentials from env vars set by .env.test.
 */
export function getDevLoginCredentials(configService: ConfigService): {
  username: string;
  password: string;
} {
  return {
    username: configService.getOrThrow<string>('DEV_LOGIN_USERNAME'),
    password: configService.getOrThrow<string>('DEV_LOGIN_PASSWORD'),
  };
}

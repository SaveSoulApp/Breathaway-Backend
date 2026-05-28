import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { ClientIdentityGuard } from '@common/guards/client-identity.guard';
import { ExceptionLoggingFilter, LoggerModule, LoggerService } from '@core/logger';
import { PrismaModule } from '@infrastructure/database/prisma.module';
import { FirebaseModule } from '@modules/firebase/firebase.module';
import { FirebaseService } from '@modules/firebase/firebase.service';
import { AuthModule } from '@modules/auth/auth.module';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AuthMethod } from '@modules/auth/utils/auth-method.utils';
import type { FirebaseValidationResult } from '@modules/firebase/firebase.service';

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
export async function createAuthTestApp(): Promise<AppTestContext> {
  const mockFirebaseValidation = jest.fn<Promise<FirebaseValidationResult>, [string, string]>();

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
    .compile();

  const app = moduleFixture.createNestApplication();

  // Mirror main.ts bootstrap
  const logger = app.get(LoggerService);
  app.useLogger(logger);
  app.useGlobalFilters(new ExceptionLoggingFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
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
export function mockPhoneFirebaseToken(phoneNumber: string): FirebaseValidationResult {
  return {
    decodedToken: {
      uid: 'test-firebase-uid',
      phone_number: phoneNumber,
      firebase: { sign_in_provider: 'phone' },
    } as never,
    authMethod: {
      method: AuthMethod.PHONE,
      identifier: phoneNumber,
      isVerified: true,
    },
  };
}

/**
 * Builds a mock FirebaseValidationResult for email/password authentication.
 */
export function mockEmailFirebaseToken(email: string): FirebaseValidationResult {
  return {
    decodedToken: {
      uid: 'test-firebase-uid',
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    } as never,
    authMethod: {
      method: AuthMethod.EMAIL,
      identifier: email,
      isVerified: true,
    },
  };
}

/**
 * Generates a valid Basic Auth header value from username:password.
 */
export function buildBasicAuthHeader(username: string, password: string): string {
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

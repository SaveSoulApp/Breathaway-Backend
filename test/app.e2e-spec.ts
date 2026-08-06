import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { ClientIdentityGuard } from '@common/guards/client-identity.guard';
import { LoggerModule, LoggerService } from '@core/logger';
import { GlobalExceptionFilter } from '@core/exception-filters/global-exception.filter';
import { PrismaExceptionFilter } from '@infrastructure/database/exception-filters/prisma-exception.filter';
import { ClsModule, ClsService } from 'nestjs-cls';
import { PrismaModule } from '@infrastructure/database/prisma.module';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import request from 'supertest';
import { App } from 'supertest/types';

function getClientIdentityHeaders(
  app: INestApplication,
): Record<string, string> {
  const config = app.get(ConfigService);
  const apiKeys = JSON.parse(config.get<string>('API_KEYS', '[]')) as string[];
  const clientIds = JSON.parse(
    config.get<string>('CLIENT_IDS', '[]'),
  ) as string[];
  const appName = config.get<string>('APP_NAME', 'BreathAway');
  const minVersion = config.get<string>('MIN_APP_VERSION', '1.0.0');
  const platforms = JSON.parse(
    config.get<string>('REQUIRED_PLATFORMS', '["iOS"]'),
  ) as string[];

  return {
    'x-api-key': apiKeys[0] ?? 'test-api-key',
    'x-client-id': clientIds[0] ?? 'test-client-id',
    'x-device-id': 'e2e-test-device-001',
    'x-user-agent': `${appName}/${minVersion} (${platforms[0] ?? 'iOS'} 17.0; TestDevice)`,
  };
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
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
        ClsModule.forRoot({ global: true }),
      ],
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: APP_GUARD,
          useClass: ClientIdentityGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    const logger = app.get(LoggerService);
    app.useLogger(logger);

    // Suppress expected 4xx HTTP exception logs from the global filter during tests
    const originalForContext = logger.forContext.bind(logger);
    jest.spyOn(logger, 'forContext').mockImplementation((context: string) => {
      const contextualLogger = originalForContext(context);
      if (context === 'ExceptionLoggingFilter') {
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1 (GET)', async () => {
    const headers = getClientIdentityHeaders(app);
    const res = await request(app.getHttpServer()).get('/api/v1').set(headers);

    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });
});

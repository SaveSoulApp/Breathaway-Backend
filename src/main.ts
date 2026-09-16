process.env.TZ = 'UTC';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ClsService } from 'nestjs-cls';

import { TimezoneResponseInterceptor } from '@common/interceptors';
import { GlobalExceptionFilter } from '@core/exception-filters/global-exception.filter';
import { LoggerService, LoggingInterceptor } from '@core/logger';
import { PrismaExceptionFilter } from '@infrastructure/database/exception-filters/prisma-exception.filter';

import { AppModule } from './app.module';
import { configureCors } from './config/cors.config';
import { setupSwagger } from './config/swagger.config';

/**
 * Configures HTTP security headers via Helmet.
 * Disables CSP for Swagger asset delivery and enables cross-origin resource policy for browser clients.
 */
function configureSecurity(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
}

/**
 * Registers global response and logging interceptors.
 */
function configureInterceptors(app: INestApplication): void {
  app.useGlobalInterceptors(
    app.get(LoggingInterceptor),
    app.get(TimezoneResponseInterceptor),
  );
}

/**
 * Registers global exception filters.
 *
 * Note: NestJS evaluates global filters in reverse order of registration (last registered runs first).
 * Therefore, the catch-all GlobalExceptionFilter MUST be registered FIRST in the arguments list.
 * Any specific filters (like PrismaExceptionFilter) MUST be registered AFTER GlobalExceptionFilter
 * so they get priority to handle domain/database exceptions before the catch-all consumes them.
 */
function configureFilters(
  app: INestApplication,
  logger: LoggerService,
  configService: ConfigService,
): void {
  app.useGlobalFilters(
    new GlobalExceptionFilter(logger, configService, app.get(ClsService)),
    new PrismaExceptionFilter(logger, app.get(ClsService)),
  );
}

/**
 * Configures URI-based API versioning (e.g. `/api/v1/...`).
 */
function configureVersioning(app: INestApplication): void {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });
}

async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // 1. Core Services Setup
  const logger = app.get(LoggerService);
  const configService = app.get(ConfigService);
  app.useLogger(logger);

  // 2. HTTP Security, CORS & Interceptors
  configureCors(app, configService);
  configureSecurity(app);
  configureInterceptors(app);
  configureFilters(app, logger, configService);

  // 3. API Versioning
  configureVersioning(app);

  // 4. API Documentation & Lifecycle
  setupSwagger(app, configService);
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(
    `🚀 Application successfully started on port ${port}`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

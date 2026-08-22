process.env.TZ = 'UTC';

import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ClsService } from 'nestjs-cls';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { GlobalExceptionFilter } from './core/exception-filters/global-exception.filter';
import { LoggerService, LoggingInterceptor } from './core/logger';
import { PrismaExceptionFilter } from './infrastructure/database/exception-filters/prisma-exception.filter';

import { TimezoneResponseInterceptor } from './common/interceptors';

async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 1. Core Services Setup
  const logger = app.get(LoggerService);
  const configService = app.get(ConfigService);

  app.useLogger(logger);

  // 2. Global Middleware & Interceptors
  app.useGlobalInterceptors(
    app.get(LoggingInterceptor),
    app.get(TimezoneResponseInterceptor),
  );
  // Note: NestJS evaluates global filters in reverse order of registration (last registered runs first).
  // Therefore, the catch-all GlobalExceptionFilter MUST be registered FIRST in the arguments list.
  // Any specific filters (like PrismaExceptionFilter or future custom filters) MUST be registered
  // AFTER GlobalExceptionFilter so they get priority to handle exceptions before the catch-all consumes them.
  app.useGlobalFilters(
    new GlobalExceptionFilter(logger, configService, app.get(ClsService)),
    new PrismaExceptionFilter(logger, app.get(ClsService)),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // 3. API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // 4. Graceful Shutdown
  app.enableShutdownHooks();

  setupSwagger(app, configService);

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

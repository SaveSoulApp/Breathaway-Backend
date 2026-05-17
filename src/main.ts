import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import {
  ExceptionLoggingFilter,
  LoggerService,
  LoggingInterceptor,
} from './core/logger';

async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 1. Core Services Setup
  const logger = app.get(LoggerService);
  const configService = app.get(ConfigService);

  app.useLogger(logger);

  // 2. Global Middleware & Interceptors
  app.useGlobalInterceptors(app.get(LoggingInterceptor));
  app.useGlobalFilters(new ExceptionLoggingFilter(logger));

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

  setupSwagger(app);

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

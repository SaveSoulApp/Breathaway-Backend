import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ExceptionLoggingFilter } from './core/logger/exception-logging.filter';
import { LoggerService } from './core/logger/logger.service';
import { LoggingInterceptor } from './core/logger/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    // logger: false, // Built in logger
  });

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  app.useGlobalFilters(new ExceptionLoggingFilter(logger));

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1', // Default if no version specified
    prefix: 'api/v', // Custom prefix: /api/v1/users
  });

  const config = new DocumentBuilder()
    .setTitle('Identity API')
    .setDescription('Auth + User Profile APIs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  logger.log(`Application starting on port ${process.env.PORT ?? 3000}`);

  const port = process.env.PORT || 3000;
  // Cloud Run requires 0.0.0.0
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 App running on port ${port}`);

  logger.log(
    `Application started successfully on port ${process.env.PORT ?? 3000}`,
  );
}
bootstrap();

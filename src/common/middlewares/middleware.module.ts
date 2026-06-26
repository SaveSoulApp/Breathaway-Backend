import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './request-id.middleware';
import { TimezoneMiddleware } from './timezone.middleware';

/**
 * Encapsulates and provisions all global application middlewares.
 *
 * Imports:
 *   - ConfigModule: provides access to environment configuration if needed by middlewares.
 *
 * Exports:
 *   - RequestIdMiddleware: validates and attaches the tracing identifier to requests.
 *   - TimezoneMiddleware: normalizes the client timezone for date-time processing.
 */
@Module({
  imports: [ConfigModule],
  providers: [RequestIdMiddleware, TimezoneMiddleware],
  exports: [RequestIdMiddleware, TimezoneMiddleware],
})
export class MiddlewareModule {}

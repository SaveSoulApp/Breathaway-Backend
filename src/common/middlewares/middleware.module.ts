import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './request-id.middleware';
import { TimezoneMiddleware } from './timezone.middleware';

@Module({
  imports: [ConfigModule],
  providers: [RequestIdMiddleware, TimezoneMiddleware],
  exports: [RequestIdMiddleware, TimezoneMiddleware],
})
export class MiddlewareModule {}

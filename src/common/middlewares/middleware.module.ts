import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyMiddleware } from './api-key.middleware';
import { ClientIdMiddleware } from './client-id.middleware';
import { DeviceIdMiddleware } from './device-id.middleware';
import { RequestIdMiddleware } from './request-id.middleware';
import { TimezoneMiddleware } from './timezone.middleware';
import { UserAgentMiddleware } from './user-agent.middleware';

@Module({
  imports: [ConfigModule],
  providers: [
    ClientIdMiddleware,
    ApiKeyMiddleware,
    DeviceIdMiddleware,
    UserAgentMiddleware,
    RequestIdMiddleware,
    TimezoneMiddleware,
  ],
  exports: [
    ClientIdMiddleware,
    ApiKeyMiddleware,
    DeviceIdMiddleware,
    UserAgentMiddleware,
    RequestIdMiddleware,
    TimezoneMiddleware,
  ],
})
export class MiddlewareModule {}

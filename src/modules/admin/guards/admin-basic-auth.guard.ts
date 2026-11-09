import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { RedisService } from '@infrastructure/redis';

import { AdminOidcAuthGuard } from './admin-oidc-auth.guard';

/**
 * @deprecated Use AdminOidcAuthGuard instead.
 *
 * Inherits from AdminOidcAuthGuard to maintain backward compatibility across
 * existing modules, controllers, and test suites while enforcing Google OIDC
 * and GCP IAM authentication.
 */
@Injectable()
export class AdminBasicAuthGuard extends AdminOidcAuthGuard {
  constructor(
    loggerService: LoggerService,
    configService: ConfigService,
    clsService: ClsService,
    @Optional() redisService?: RedisService,
  ) {
    super(loggerService, configService, clsService, redisService);
  }
}

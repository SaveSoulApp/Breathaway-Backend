import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Restricts access to routes to non-production environments only.
 *
 * Verifies that neither `NODE_ENV` nor `DEPLOYMENT_ENV` is set to `production`.
 * If running in production, execution is halted immediately and a `404 NotFoundException`
 * is thrown to avoid disclosing the existence of internal or testing endpoints.
 */
@Injectable()
export class NonProductionGuard implements CanActivate {
  private readonly logger: ContextualLogger;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.forContext(NonProductionGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = this.configService
      .get<string>('NODE_ENV')
      ?.toLowerCase()
      .trim();
    const deploymentEnv = this.configService
      .get<string>('DEPLOYMENT_ENV')
      ?.toLowerCase()
      .trim();

    if (nodeEnv === 'production' || deploymentEnv === 'production') {
      const request = context.switchToHttp().getRequest<Request>();
      const clientIp =
        (request.headers?.['x-forwarded-for'] as string)
          ?.split(',')[0]
          ?.trim() || request.ip;

      this.logger.warn(
        'Blocked attempt to access non-production endpoint in production environment',
        {
          step: 'non_production_blocked',
          route: request.originalUrl || request.url,
          method: request.method,
          nodeEnv,
          deploymentEnv,
          clientIp,
        },
      );

      throw new NotFoundException('Endpoint not available in production');
    }

    return true;
  }
}

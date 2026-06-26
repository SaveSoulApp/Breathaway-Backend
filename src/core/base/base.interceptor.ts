import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Foundational interceptor class for standardizing cross-cutting request/response transformations.
 *
 * Automatically provisions a context-aware logger, ensuring that any side effects or
 * transformations performed by the interceptor are logged with the correct contextual prefix.
 */
export abstract class BaseInterceptor {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

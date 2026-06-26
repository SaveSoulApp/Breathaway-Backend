import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Foundational handler class (typically for CQRS commands/queries or event subscribers).
 *
 * Provides an isolated, context-aware logger instance to ensure execution logs are
 * properly attributed to the specific handler processing the operation.
 */
export abstract class BaseHandler {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

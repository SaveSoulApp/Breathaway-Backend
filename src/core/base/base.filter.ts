import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Foundational exception filter class for consistent error catching and formatting.
 *
 * Injects a context-aware logger so that caught exceptions and formatting logic can be
 * traced back to the specific filter implementation handling the error.
 */
export abstract class BaseFilter {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

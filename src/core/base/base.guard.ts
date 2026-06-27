import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Foundational guard class providing common utilities for authorization and access control.
 *
 * Instantiates a context-aware logger tied to the specific guard implementation, facilitating
 * traceable security logs for access grants and denials.
 */
export abstract class BaseGuard {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

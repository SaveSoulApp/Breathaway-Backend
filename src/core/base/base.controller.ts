import { ContextualLogger, LoggerService } from '@core/logger';

/**
 * Foundational controller class that provides common infrastructure capabilities to all HTTP controllers.
 *
 * Automatically provisions a context-aware logger instance upon instantiation, ensuring that
 * all controller-level logs are correctly attributed to their respective route namespaces.
 */
export abstract class BaseController {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

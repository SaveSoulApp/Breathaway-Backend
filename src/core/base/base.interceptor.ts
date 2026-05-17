import { ContextualLogger, LoggerService } from '@core/logger';

export abstract class BaseInterceptor {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

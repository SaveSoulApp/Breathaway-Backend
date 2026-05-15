import { ContextualLogger } from '@core/logger/logger.interface';
import { LoggerService } from '@core/logger/logger.service';

export abstract class BaseHandler {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

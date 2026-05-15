import { ContextualLogger } from 'src/core/logger/logger.interface';
import { LoggerService } from 'src/core/logger/logger.service';

export abstract class BaseService {
  protected readonly logger: ContextualLogger;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }
}

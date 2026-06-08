import { ContextualLogger, LoggerService } from '@core/logger';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditEventDto } from '@modules/audit/dto/audit-event.dto';
import { Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export abstract class BaseService {
  protected readonly logger: ContextualLogger;

  @Inject(EventEmitter2)
  protected readonly eventEmitter: EventEmitter2;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }

  /**
   * Helper method to emit audit logs consistently across all services.
   */
  protected emitAuditLog(payload: AuditEventDto): void {
    this.eventEmitter.emit(AUDIT_LOG_EVENT, payload);
  }
}

import { ContextualLogger, LoggerService } from '@core/logger';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditEventDto } from '@modules/audit/dto/audit-event.dto';
import { Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';

/**
 * Foundational service class that provides common infrastructure capabilities to all domain services.
 *
 * Automatically provisions a context-aware logger instance and injects the global event emitter
 * and CLS (Continuation-Local Storage) context. This ensures consistent logging and audit trail
 * emission across the entire service layer without boilerplate.
 */
export abstract class BaseService {
  protected readonly logger: ContextualLogger;

  @Inject(EventEmitter2)
  protected readonly eventEmitter: EventEmitter2;

  @Inject(ClsService)
  protected readonly cls: ClsService;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.forContext(this.constructor.name);
  }

  /**
   * Emits a standardized audit log event for compliance and tracking purposes.
   *
   * Automatically enriches the provided payload with the current request's IP address
   * and User-Agent, extracted securely from the CLS context. This guarantees that audit trails
   * always contain network origin data even when triggered deeply within nested service calls.
   *
   * @param payload - The base audit event details (action, resource, user, etc.) to be recorded.
   */
  protected emitAuditLog(payload: AuditEventDto): void {
    const ipAddress = this.cls.get<string | undefined>('ipAddress');
    const userAgent = this.cls.get<string | undefined>('userAgent');

    const enrichedPayload: AuditEventDto = {
      ...payload,
      ipAddress: payload.ipAddress || ipAddress,
      metadata: {
        ...payload.metadata,
        ...(userAgent && { userAgent }),
      },
    };

    this.eventEmitter.emit(AUDIT_LOG_EVENT, enrichedPayload);
  }
}

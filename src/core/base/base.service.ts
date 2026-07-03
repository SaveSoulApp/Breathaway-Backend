import { ContextualLogger, LoggerService } from '@core/logger';
import { AUDIT_LOG_EVENT } from '@modules/audit/constants/audit.constants';
import { AuditEventRequestDto } from '@modules/audit/dto';
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
   * Automatically enriches the provided payload with the current request's IP address,
   * User-Agent, and request ID — all extracted from the CLS context. The `requestId`
   * in `metadata` allows any downstream Pub/Sub consumer to correlate an audit event
   * back to its originating Cloud Logging trace with a single query.
   *
   * @param payload - The base audit event details (action, resource, user, etc.) to be recorded.
   */
  protected emitAuditLog(payload: AuditEventRequestDto): void {
    const ipAddress = this.cls.get<string | undefined>('ipAddress');
    const userAgent = this.cls.get<string | undefined>('userAgent');
    const requestId = this.cls.get<string | undefined>('requestId');

    const enrichedPayload: AuditEventRequestDto = {
      ...payload,
      ipAddress: payload.ipAddress || ipAddress,
      metadata: {
        ...payload.metadata,
        ...(userAgent && { userAgent }),
        ...(requestId && { requestId }),
      },
    };

    this.eventEmitter.emit(AUDIT_LOG_EVENT, enrichedPayload);
  }
}

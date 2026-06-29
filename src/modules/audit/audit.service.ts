import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_LOG_EVENT } from './constants';
import { AuditEventRequestDto } from './dto';

/**
 * Listens for internal `audit.log` application events and forwards them as
 * structured Pub/Sub messages to the configured audit topic.
 *
 * Acts as a decoupled sink: feature modules emit events via NestJS EventEmitter
 * without needing to know about Pub/Sub or the audit topic. Error handling is
 * intentionally non-throwing — audit failures must never disrupt the originating
 * business operation.
 */
@Injectable()
export class AuditService extends BaseService {
  /** Pub/Sub topic name for audit events; defaults to `audit-logs-topic` when not configured. */
  private auditTopic: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pubSubPublisher: PubSubPublisherService,
    loggerService: LoggerService,
  ) {
    super(loggerService);
    this.auditTopic =
      this.configService.get<string>('AUDIT_PUBSUB_TOPIC') ||
      'audit-logs-topic';
  }

  /**
   * Receives an `audit.log` application event and publishes it to the audit
   * Pub/Sub topic tagged with the event's action type as an attribute.
   *
   * Failures are caught and logged rather than propagated — a Pub/Sub outage
   * must not cause the originating HTTP request or workflow to fail.
   *
   * @param payload - The audit event containing the actor, action type, and
   *                  optional resource and metadata context.
   */
  @OnEvent(AUDIT_LOG_EVENT)
  async handleAuditLogEvent(payload: AuditEventRequestDto) {
    try {
      await this.pubSubPublisher.publish(
        this.auditTopic,
        PubSubEvent.SYSTEM_AUDIT_LOG,
        payload as unknown as Record<string, unknown>,
        { actionType: payload.actionType },
      );

      this.logger.debug(
        `Audit event published: ${payload.actionType} for user ${payload.userId}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to publish audit event: ${(error as Error)?.message}`,
        {
          stack: (error as Error)?.stack,
        },
      );
    }
  }
}

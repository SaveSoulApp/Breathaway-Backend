import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PubSubEvent } from '@modules/pubsub/enums/pubsub-events.enum';
import { PubSubPublisherService } from '@modules/pubsub/pubsub-publisher.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_LOG_EVENT } from './constants';
import { AuditEventDto } from './dto/audit-event.dto';

@Injectable()
export class AuditService extends BaseService {
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

  @OnEvent(AUDIT_LOG_EVENT)
  async handleAuditLogEvent(payload: AuditEventDto) {
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

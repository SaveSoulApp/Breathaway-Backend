import { PubSub } from '@google-cloud/pubsub';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { AUDIT_LOG_EVENT } from './constants';
import { AuditEventDto } from './dto/audit-event.dto';

@Injectable()
export class AuditService extends BaseService {
  private pubSubClient: PubSub;
  private auditTopic: string;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    super(loggerService);
    this.pubSubClient = new PubSub();
    this.auditTopic =
      this.configService.get<string>('AUDIT_PUBSUB_TOPIC') ||
      'audit-logs-topic';
  }

  @OnEvent(AUDIT_LOG_EVENT)
  async handleAuditLogEvent(payload: AuditEventDto) {
    try {
      const dataBuffer = Buffer.from(JSON.stringify(payload));

      await this.pubSubClient
        .topic(this.auditTopic)
        .publishMessage({ data: dataBuffer });

      this.logger.debug(
        `Audit event published: ${payload.actionType} for user ${payload.userId}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to publish audit event: ${error?.message}`, {
        stack: error?.stack,
      });
    }
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditService } from './audit.service';

/**
 * Encapsulates the audit trail subsystem — capturing and publishing significant
 * domain events (logins, identity verifications, purchases, etc.) to a GCP Pub/Sub
 * topic for downstream compliance and observability pipelines.
 *
 * Imports:
 *   - ConfigModule: supplies the AUDIT_PUBSUB_TOPIC environment variable that
 *     determines which Pub/Sub topic audit events are routed to.
 *
 * Exports:
 *   - AuditService: exposed so any feature module can emit audit events by
 *     firing the `audit.log` application event without taking a direct dependency
 *     on Pub/Sub infrastructure.
 */
@Module({
  imports: [ConfigModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

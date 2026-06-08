import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PubSubModule } from '../pubsub/pubsub.module';
import { AuditService } from './audit.service';

@Module({
  imports: [ConfigModule, PubSubModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

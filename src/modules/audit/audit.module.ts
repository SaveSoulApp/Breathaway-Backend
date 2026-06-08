import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditService } from './audit.service';

@Module({
  imports: [ConfigModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

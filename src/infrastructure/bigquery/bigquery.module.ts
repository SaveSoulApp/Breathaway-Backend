import { Global, Module } from '@nestjs/common';

import { BigQueryAuditService } from './bigquery-audit.service';

@Global()
@Module({
  providers: [BigQueryAuditService],
  exports: [BigQueryAuditService],
})
export class BigQueryModule {}

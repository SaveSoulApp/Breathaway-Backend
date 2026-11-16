import { Module } from '@nestjs/common';

import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Encapsulates legal document versioning, user consent tracking, compliance gating,
 * and immutable regulatory audit trail management.
 */
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}

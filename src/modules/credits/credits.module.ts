import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

/**
 * Encapsulates the credit economy bounded context — balance tracking, ledger history,
 * and credit grant/consume operations.
 *
 * @exports CreditsService — exported so peer modules (e.g. LikesModule, SchedulerModule)
 * can call {@link CreditsService#grantCredits}, {@link CreditsService#consumeCredits}, and
 * {@link CreditsService#hasSufficientCredits} within their own transaction scopes without
 * introducing a circular import.
 */
@Module({
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}

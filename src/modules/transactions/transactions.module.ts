import { Module } from '@nestjs/common';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Encapsulates the transactions bounded context — the gateway-agnostic record of
 * inbound money events from RevenueCat, Razorpay, and any future provider.
 *
 * @exports TransactionsService — exposed so webhook handlers can record a
 * transaction inside their own Prisma transaction scope, committing the
 * transaction row and the resulting credit grant atomically.
 */
@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}

import { Module } from '@nestjs/common';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { BigQueryModule } from '@infrastructure/bigquery/bigquery.module';
import { PrismaModule } from '@infrastructure/database/prisma.module';
import { GcpStorageModule } from '@infrastructure/storage/gcp-storage.module';
import { ChatsModule } from '@modules/chats/chats.module';
import { PubSubModule } from '@modules/pubsub/pubsub.module';

import { DsarExportService } from './services/dsar-export.service';
import { DsarExportWorkerService } from './services/dsar-export-worker.service';
import { UsersController } from './users.controller';

/**
 * Users module encapsulating account-level operations, compliance, and DSAR data portability.
 */
@Module({
  imports: [
    PrismaModule,
    PubSubModule,
    ChatsModule,
    IdentityCryptoModule,
    GcpStorageModule,
    BigQueryModule,
  ],
  controllers: [UsersController],
  providers: [DsarExportService, DsarExportWorkerService],
  exports: [DsarExportService, DsarExportWorkerService],
})
export class UsersModule {}

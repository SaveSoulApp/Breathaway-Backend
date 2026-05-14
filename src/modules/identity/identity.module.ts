import { Module } from '@nestjs/common';
import { KmsModule } from 'src/core/kms/kms.module';
import { PrismaModule } from 'src/core/prisma/prisma.module';
import { IdentityEncryptionService } from './identity-encryption.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [KmsModule, PrismaModule],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityEncryptionService],
})
export class IdentityModule {}

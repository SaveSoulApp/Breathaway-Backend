import { CreditsModule } from '@modules/credits/credits.module';
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CreditsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

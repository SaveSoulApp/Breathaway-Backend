import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { BlocksModule } from '@modules/blocks/blocks.module';

import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { SupabaseAuthService } from './services/supabase-auth.service';

@Module({
  imports: [JwtModule.register({}), BlocksModule],
  controllers: [ChatsController],
  providers: [ChatsService, SupabaseAuthService],
  exports: [ChatsService],
})
export class ChatsModule {}

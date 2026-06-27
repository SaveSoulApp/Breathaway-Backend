import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { SupabaseAuthService } from './services/supabase-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ChatsController],
  providers: [ChatsService, SupabaseAuthService],
  exports: [ChatsService],
})
export class ChatsModule {}

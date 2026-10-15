import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { IdentityCryptoModule } from '@core/identity-crypto/identity-crypto.module';
import { BlocksModule } from '@modules/blocks/blocks.module';

import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatRoomParticipantGuard } from './guards';
import { ChatCryptoService } from './services/chat-crypto.service';
import { SupabaseAuthService } from './services/supabase-auth.service';

@Module({
  imports: [JwtModule.register({}), BlocksModule, IdentityCryptoModule],
  controllers: [ChatsController],
  providers: [
    ChatsService,
    SupabaseAuthService,
    ChatCryptoService,
    ChatRoomParticipantGuard,
  ],
  exports: [ChatsService, ChatCryptoService, ChatRoomParticipantGuard],
})
export class ChatsModule {}

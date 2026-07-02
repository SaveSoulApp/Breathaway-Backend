import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MessageNotFoundException } from './application/exceptions';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  CreateMessageRequestDto,
  GetMessagesRequestDto,
  MarkMessageReadRequestDto,
} from './dto';
import { generateRoomParticipants } from './utils/chats.utils';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly supabase: SupabaseClient<any, 'public', any>;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. ChatsService may fail.',
      );
    }

    // Initialize with service role key to bypass RLS for server-side operations
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.supabase = createClient(supabaseUrl || '', supabaseKey || '', {
      auth: { persistSession: false },
    });
  }

  async getMessages(
    userId: string,
    roomId: string,
    dto: GetMessagesRequestDto,
  ) {
    const { cursor, limit = 20 } = dto;

    let query = this.supabase
      .from('Message')
      .select('*')
      .eq('roomId', roomId)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('createdAt', cursor);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch messages: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to fetch messages');
    }

    const messages = (data as Record<string, unknown>[]) || [];

    return {
      messages,
      nextCursor:
        messages.length === limit
          ? (messages[messages.length - 1].createdAt as string)
          : null,
    };
  }

  async sendMessage(senderId: string, dto: CreateMessageRequestDto) {
    const { targetUserId, content } = dto;
    const { userOneId, userTwoId } = generateRoomParticipants(
      senderId,
      targetUserId,
    );

    // 1. Ensure the room exists idempotently
    const { data: roomData, error: roomError } = await this.supabase
      .from('ChatRoom')
      .upsert({ userOneId, userTwoId }, { onConflict: 'userOneId, userTwoId' })
      .select('id')
      .single();

    const room = roomData as { id: string } | null;

    if (roomError || !room) {
      this.logger.error(
        `Failed to upsert chat room: ${roomError?.message}`,
        roomError,
      );
      throw new InternalServerErrorException('Failed to process chat room');
    }

    // 2. Insert the message
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error: msgError } = await this.supabase
      .from('Message')
      .insert({
        roomId: room.id,
        senderId,
        content,
      })
      .select('*')
      .single();

    const message = data as Record<string, unknown>;

    if (msgError) {
      this.logger.error(
        `Failed to send message: ${msgError.message}`,
        msgError,
      );
      throw new InternalServerErrorException('Failed to send message');
    }

    // 3. Fire-and-forget push notification
    this.triggerPushNotification(targetUserId, senderId, content).catch(
      (err: Error) => {
        this.logger.error(
          `Failed to send push notification: ${err.message}`,
          err,
        );
      },
    );

    return message;
  }

  async markMessageRead(
    userId: string,
    roomId: string,
    dto: MarkMessageReadRequestDto,
  ) {
    // Fetch the reference message to get its createdAt timestamp
    const { data: refMessage, error: fetchError } = await this.supabase
      .from('Message')
      .select('createdAt')
      .eq('id', dto.messageId)
      .eq('roomId', roomId)
      .single();

    if (fetchError || !refMessage) {
      throw new MessageNotFoundException(dto.messageId);
    }

    // Update all unread messages in this room sent by the OTHER person, older than or equal to the ref message
    const { error: updateError } = await this.supabase
      .from('Message')
      .update({ readAt: new Date().toISOString() })
      .eq('roomId', roomId)
      .neq('senderId', userId)
      .is('readAt', null)
      .lte('createdAt', refMessage.createdAt);

    if (updateError) {
      this.logger.error(
        `Failed to mark messages as read: ${updateError.message}`,
        updateError,
      );
      throw new InternalServerErrorException('Failed to mark messages as read');
    }

    return { success: true };
  }

  private async triggerPushNotification(
    targetUserId: string,
    senderId: string,
    content: string,
  ) {
    // TODO: Integrate with existing push notification service
    this.logger.log(
      `[Push Notification Simulation] Sending to ${targetUserId}: ${content.substring(0, 20)}...`,
    );
    return Promise.resolve();
  }
}

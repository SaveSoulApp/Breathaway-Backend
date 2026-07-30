import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';

import { MessageNotFoundException } from './application/exceptions';
import {
  CreateMessageRequestDto,
  GetMessagesRequestDto,
  GetRoomsRequestDto,
  MarkMessageReadRequestDto,
} from './dto';
import { generateRoomParticipants } from './utils/chats.utils';

@Injectable()
export class ChatsService extends BaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly supabase: SupabaseClient<any, 'public', any>;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. ChatsService may fail.',
        { step: 'init' },
      );
    }

    // Initialize with service role key to bypass RLS for server-side operations
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.supabase = createClient(supabaseUrl || '', supabaseKey || '', {
      auth: { persistSession: false },
    });
  }

  async getRooms(userId: string, dto: GetRoomsRequestDto) {
    const { limit = 20 } = dto;

    let data;
    let error;
    try {
      const response = await this.supabase
        .from('ChatRoom')
        .select('*')
        .or(`userOneId.eq.${userId},userTwoId.eq.${userId}`)
        .limit(limit);

      data = response.data;
      error = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch chat rooms', {
        userId,
        limit,
        step: 'fetch_rooms',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to fetch chat rooms');
    }

    if (error) {
      this.logger.error('Failed to fetch chat rooms', {
        userId,
        limit,
        step: 'fetch_rooms',
        err: serializeError(error),
      });
      throw new InternalServerErrorException('Failed to fetch chat rooms');
    }

    const rooms = (data as Record<string, any>[]) || [];

    // Extract all unique other user IDs
    const otherUserIds = Array.from(
      new Set(
        rooms.map((room) =>
          room.userOneId === userId ? room.userTwoId : room.userOneId,
        ),
      ),
    );

    // Fetch profiles from Prisma
    let profiles: {
      userId: string;
      firstName: string;
      lastName: string | null;
    }[] = [];
    if (otherUserIds.length > 0) {
      try {
        profiles = await this.prisma.userProfile.findMany({
          where: { userId: { in: otherUserIds } },
          select: { userId: true, firstName: true, lastName: true },
        });
      } catch (err: unknown) {
        this.logger.error('Failed to fetch user profiles for chat rooms', {
          userId,
          otherUserIds,
          step: 'fetch_profiles',
          err: serializeError(err),
        });
        // We can choose to fail the request or just return null for otherUser.
        // Returning 500 is safer to prevent UI crashes if frontend strictly expects names.
        throw new InternalServerErrorException(
          'Failed to fetch chat room details',
        );
      }
    }

    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const enrichedRooms = rooms.map((room) => {
      const otherUserId =
        room.userOneId === userId ? room.userTwoId : room.userOneId;
      const profile = profileMap.get(otherUserId);
      return {
        ...room,
        otherUser: profile
          ? {
              id: profile.userId,
              firstName: profile.firstName,
              lastName: profile.lastName,
            }
          : null,
      };
    });

    return { rooms: enrichedRooms };
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

    let data;
    let error;
    try {
      const response = await query;
      data = response.data;
      error = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch messages', {
        roomId,
        cursor,
        limit,
        step: 'fetch_messages',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to fetch messages');
    }

    if (error) {
      this.logger.error('Failed to fetch messages', {
        roomId,
        cursor,
        limit,
        step: 'fetch_messages',
        err: serializeError(error),
      });
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
    let roomData;
    let roomError;
    try {
      const response = await this.supabase
        .from('ChatRoom')
        .upsert(
          { userOneId, userTwoId },
          { onConflict: 'userOneId, userTwoId' },
        )
        .select('id')
        .single();
      roomData = response.data;
      roomError = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to process chat room', {
        senderId,
        targetUserId,
        step: 'get_or_create_room',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to process chat room');
    }

    const room = roomData as { id: string } | null;

    if (roomError || !room) {
      this.logger.error('Failed to process chat room', {
        senderId,
        targetUserId,
        step: 'get_or_create_room',
        err: serializeError(roomError),
      });
      throw new InternalServerErrorException('Failed to process chat room');
    }

    // 2. Insert the message
    let data: unknown;
    let msgError;
    try {
      const response = await this.supabase
        .from('Message')
        .insert({
          roomId: room.id,
          senderId,
          content,
        })
        .select('*')
        .single();
      data = response.data;
      msgError = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to send message', {
        roomId: room.id,
        senderId,
        targetUserId,
        step: 'send_message',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to send message');
    }

    const message = data as Record<string, unknown>;

    if (msgError) {
      this.logger.error('Failed to send message', {
        roomId: room.id,
        senderId,
        targetUserId,
        step: 'send_message',
        err: serializeError(msgError),
      });
      throw new InternalServerErrorException('Failed to send message');
    }

    // 3. Fire-and-forget push notification
    this.triggerPushNotification(targetUserId, senderId, content).catch(
      (err: Error) => {
        this.logger.error('Failed to send push notification', {
          targetUserId,
          senderId,
          step: 'send_push',
          err: serializeError(err),
        });
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
    let refMessage;
    let fetchError;
    try {
      const response = await this.supabase
        .from('Message')
        .select('createdAt')
        .eq('id', dto.messageId)
        .eq('roomId', roomId)
        .single();
      refMessage = response.data;
      fetchError = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch reference message', {
        messageId: dto.messageId,
        roomId,
        userId,
        step: 'mark_read',
        err: serializeError(err),
      });
      throw new MessageNotFoundException(dto.messageId);
    }

    if (fetchError || !refMessage) {
      this.logger.warn('Failed to mark message read: message not found', {
        messageId: dto.messageId,
        roomId,
        userId,
        step: 'mark_read',
      });
      throw new MessageNotFoundException(dto.messageId);
    }

    // Update all unread messages in this room sent by the OTHER person, older than or equal to the ref message
    let updateError;
    try {
      const response = await this.supabase
        .from('Message')
        .update({ readAt: new Date().toISOString() })
        .eq('roomId', roomId)
        .neq('senderId', userId)
        .is('readAt', null)
        .lte('createdAt', refMessage.createdAt);
      updateError = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to mark messages as read', {
        roomId,
        userId,
        step: 'mark_read',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to mark messages as read');
    }

    if (updateError) {
      this.logger.error('Failed to mark messages as read', {
        roomId,
        userId,
        step: 'mark_read',
        err: serializeError(updateError),
      });
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
    this.logger.debug('Push Notification Simulation', {
      targetUserId,
      senderId,
      contentPreview: content.substring(0, 20),
      step: 'simulate_push',
    });
    return Promise.resolve();
  }
}

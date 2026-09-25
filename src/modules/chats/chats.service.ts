import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchStatus } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlocksService } from '@modules/blocks/blocks.service';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

import {
  ActiveMatchRequiredException,
  ChatRoomAccessForbiddenException,
  ChatRoomNotFoundException,
  MessageNotFoundException,
  SelfMessageException,
  UserBlockedException,
} from './application/exceptions';
import {
  CreateMessageRequestDto,
  GetMessagesRequestDto,
  GetRoomsRequestDto,
  MarkMessageReadRequestDto,
} from './dto';
import { CHAT_MESSAGE_SENT_EVENT, ChatMessageSentEvent } from './events';
import { generateRoomParticipants } from './utils/chats.utils';

@Injectable()
export class ChatsService extends BaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly supabase: SupabaseClient<any, 'public', any>;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly blocksService: BlocksService,
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

  /**
   * Asserts that a room exists and that the calling user is an authorized participant.
   * Prevents IDOR (Insecure Direct Object Reference) access to arbitrary chat rooms.
   *
   * @param userId - ID of the calling user.
   * @param roomId - ID of the chat room.
   * @returns The room record if valid.
   * @throws {ChatRoomNotFoundException} If the room does not exist.
   * @throws {ChatRoomAccessForbiddenException} If the user is not a participant in the room.
   */
  private async assertRoomParticipant(
    userId: string,
    roomId: string,
  ): Promise<{ id: string; userOneId: string; userTwoId: string }> {
    let data;
    let error;
    try {
      const response = await this.supabase
        .from('ChatRoom')
        .select('id, userOneId, userTwoId')
        .eq('id', roomId)
        .single();
      data = response.data;
      error = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to verify chat room participant', {
        roomId,
        userId,
        step: 'assert_participant',
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to verify chat room access',
      );
    }

    if (error || !data) {
      this.logger.warn('Chat room not found', {
        roomId,
        userId,
        step: 'assert_participant',
      });
      throw new ChatRoomNotFoundException(roomId);
    }

    const room = data as { id: string; userOneId: string; userTwoId: string };

    if (room.userOneId !== userId && room.userTwoId !== userId) {
      this.logger.warn('Unauthorized chat room access attempt', {
        roomId,
        userId,
        userOneId: room.userOneId,
        userTwoId: room.userTwoId,
        step: 'assert_participant',
      });
      throw new ChatRoomAccessForbiddenException(roomId);
    }

    return room;
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

    type ChatRoomRecord = {
      id: string;
      userOneId: string;
      userTwoId: string;
      createdAt?: string;
      updatedAt?: string;
      [key: string]: unknown;
    };

    const rawRooms = (data as ChatRoomRecord[]) || [];

    // Filter out rooms involving users with whom an active block exists
    let blockedUserIds = new Set<string>();
    try {
      const activeBlocks = await this.prisma.block.findMany({
        where: {
          OR: [{ blockerUserId: userId }, { blockedUserId: userId }],
          deletedAt: null,
        },
        select: { blockerUserId: true, blockedUserId: true },
      });

      blockedUserIds = new Set(
        activeBlocks.map((b) =>
          b.blockerUserId === userId ? b.blockedUserId : b.blockerUserId,
        ),
      );
    } catch (err: unknown) {
      this.logger.error('Failed to fetch active blocks for user rooms', {
        userId,
        step: 'fetch_blocks',
        err: serializeError(err),
      });
    }

    const rooms = rawRooms.filter((room) => {
      const otherUserId =
        room.userOneId === userId ? room.userTwoId : room.userOneId;
      return !blockedUserIds.has(otherUserId);
    });

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
        // Log the error but proceed with an empty profiles array.
        // This returns partial data (rooms without otherUser profiles) instead of a hard failure.
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
    // Enforce participant authorization before fetching messages
    await this.assertRoomParticipant(userId, roomId);

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

    // 1. Prevent self-messaging
    if (senderId === targetUserId) {
      this.logger.warn('Message send failed: cannot message self', {
        senderId,
        targetUserId,
        step: 'validate_message',
      });
      throw new SelfMessageException();
    }

    // 2. Concurrently verify block status and active match requirements
    const [isBlocked, activeMatch] = await Promise.all([
      this.blocksService.isBlocked(senderId, targetUserId),
      this.prisma.match.findFirst({
        where: {
          OR: [
            { userOneId: senderId, userTwoId: targetUserId },
            { userOneId: targetUserId, userTwoId: senderId },
          ],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
          userOne: { deletedAt: null },
          userTwo: { deletedAt: null },
        },
        select: { id: true },
      }),
    ]);

    if (isBlocked) {
      this.logger.warn(
        'Message send failed: active block exists between users',
        {
          senderId,
          targetUserId,
          step: 'validate_message',
        },
      );
      throw new UserBlockedException();
    }

    if (!activeMatch) {
      this.logger.warn('Message send failed: active match required', {
        senderId,
        targetUserId,
        step: 'validate_message',
      });
      throw new ActiveMatchRequiredException();
    }

    const { userOneId, userTwoId } = generateRoomParticipants(
      senderId,
      targetUserId,
    );

    // 4. Ensure the room exists idempotently
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

    // 5. Insert the message
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

    const messageId =
      typeof message.id === 'string'
        ? message.id
        : typeof message.id === 'number'
          ? `${message.id}`
          : '';

    // 6. Emit domain event for notification dispatch
    this.eventEmitter.emit(
      CHAT_MESSAGE_SENT_EVENT,
      new ChatMessageSentEvent(
        messageId,
        room.id,
        activeMatch.id,
        senderId,
        targetUserId,
        content,
      ),
    );

    return message;
  }

  async markMessageRead(
    userId: string,
    roomId: string,
    dto: MarkMessageReadRequestDto,
  ) {
    // Enforce participant authorization before marking messages read
    await this.assertRoomParticipant(userId, roomId);

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

  /**
   * Event handler for when a user account is deleted.
   * Cleans up Supabase chat history (rooms and their messages via cascade)
   * where the user was a participant.
   */
  @OnEvent(USER_DELETED_EVENT)
  async handleUserDeletedEvent(payload: UserDeletedEvent) {
    const { userId } = payload;
    try {
      const response = await this.supabase
        .from('ChatRoom')
        .delete()
        .or(`userOneId.eq.${userId},userTwoId.eq.${userId}`);

      if (response.error) {
        this.logger.error('Failed to delete chat rooms for deleted user', {
          userId,
          step: 'delete_user_chats',
          err: serializeError(response.error),
        });
      } else {
        this.logger.event(LOG_EVENT.CHAT_HISTORY_CLEARED, { userId });
      }
    } catch (err) {
      this.logger.error('Exception while deleting chat rooms for user', {
        userId,
        step: 'delete_user_chats',
        err: serializeError(err),
      });
    }
  }
}

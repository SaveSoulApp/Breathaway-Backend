import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { MatchStatus } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LOG_EVENT, LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { BlocksService } from '@modules/blocks/blocks.service';
import { USER_DELETED_EVENT, UserDeletedEvent } from '@modules/profiles/events';

import {
  ActiveMatchRequiredException,
  ChatRoomAccessForbiddenException,
  ChatRoomNotFoundException,
  MessageDeletionForbiddenException,
  MessageNotFoundException,
  SelfMessageException,
  UserBlockedException,
} from './application/exceptions';
import {
  ChatRoomKeyResponseDto,
  CreateMessageRequestDto,
  DeleteMessagesRequestDto,
  DeleteMessagesResponseDto,
  GetMessagesRequestDto,
  GetRoomsRequestDto,
  MarkMessageReadRequestDto,
} from './dto';
import { CHAT_MESSAGE_SENT_EVENT, ChatMessageSentEvent } from './events';
import { ChatRoomRecord } from './interfaces';
import { ChatCryptoService } from './services/chat-crypto.service';
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
    private readonly identityCryptoService: IdentityCryptoService,
    private readonly chatCryptoService: ChatCryptoService,
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
  async assertRoomParticipant(
    userId: string,
    roomId: string,
  ): Promise<ChatRoomRecord> {
    let data;
    let error;
    try {
      const response = await this.supabase
        .from('ChatRoom')
        .select('id, userOneId, userTwoId, wrappedRoomKey, roomKeyId')
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

    const room = data as {
      id: string;
      userOneId: string;
      userTwoId: string;
      wrappedRoomKey: string;
      roomKeyId: string;
    };

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

  /**
   * Unwraps the room's AES-256 data key via ChatCryptoService.
   * Enforces that the room record possesses valid encryption metadata, throwing
   * an InternalServerErrorException if the key is missing or corrupted.
   */
  private getOrUnwrapRoomKey(room: {
    id: string;
    wrappedRoomKey: string;
    roomKeyId: string;
  }): Buffer {
    if (!room.wrappedRoomKey || !room.roomKeyId) {
      this.logger.error('Chat room is missing encryption key metadata', {
        roomId: room.id,
        step: 'unwrap_room_key',
      });
      throw new InternalServerErrorException(
        'Chat room encryption key is missing or corrupted',
      );
    }

    return this.chatCryptoService.unwrapRoomKey(
      room.wrappedRoomKey,
      room.roomKeyId,
    );
  }

  /**
   * Retrieves the raw 32-byte AES-256 room encryption key for the authorized participant.
   * Allows web and mobile clients to decrypt messages in-browser or on device.
   *
   * @param userId - ID of calling user.
   * @param roomId - ID of chat room.
   * @param userId - ID of calling user.
   * @param roomOrId - Chat room record (pre-validated by guard) or room ID string.
   * @returns The room ID, base64 key, and algorithm.
   */
  async getRoomKey(
    userId: string,
    roomOrId: ChatRoomRecord | string,
  ): Promise<ChatRoomKeyResponseDto> {
    const room =
      typeof roomOrId === 'string'
        ? await this.assertRoomParticipant(userId, roomOrId)
        : roomOrId;
    const roomId = room.id;

    const otherUserId =
      room.userOneId === userId ? room.userTwoId : room.userOneId;

    const isBlocked = await this.blocksService.isBlocked(userId, otherUserId);
    if (isBlocked) {
      this.logger.warn(
        'Room key retrieval forbidden: active block exists between users',
        {
          userId,
          targetUserId: otherUserId,
          roomId,
          step: 'get_room_key',
        },
      );
      throw new UserBlockedException();
    }

    const roomKey = this.getOrUnwrapRoomKey(room);

    return {
      roomId,
      key: roomKey.toString('base64'),
      algorithm: 'AES-GCM-256',
    };
  }

  async getRooms(userId: string, dto: GetRoomsRequestDto) {
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));

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
        activeBlocks
          .map((b) =>
            b.blockerUserId === userId ? b.blockedUserId : b.blockerUserId,
          )
          .filter((id): id is string => Boolean(id)),
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
        const rawProfiles = await this.prisma.userProfile.findMany({
          where: { userId: { in: otherUserIds } },
          select: { userId: true, firstName: true, lastName: true },
        });

        profiles = await Promise.all(
          rawProfiles.map(async (p) => {
            const [decryptedFirst, decryptedLast] = await Promise.all([
              this.identityCryptoService.decryptText(p.firstName),
              p.lastName
                ? this.identityCryptoService.decryptText(p.lastName)
                : Promise.resolve(null),
            ]);
            return {
              userId: p.userId,
              firstName: decryptedFirst ?? '',
              lastName: decryptedLast ?? null,
            };
          }),
        );
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
    roomOrId: ChatRoomRecord | string,
    dto: GetMessagesRequestDto,
  ) {
    // Enforce participant authorization before fetching messages (skipped if pre-validated by guard)
    const room =
      typeof roomOrId === 'string'
        ? await this.assertRoomParticipant(userId, roomOrId)
        : roomOrId;
    const roomId = room.id;
    const roomKey = this.getOrUnwrapRoomKey(room);

    const { cursor } = dto;
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));

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

    type MessageRecord = {
      id: string;
      roomId: string;
      senderId: string;
      content: string;
      createdAt: string;
      readAt?: string | null;
      [key: string]: unknown;
    };

    const rawMessages = (data as MessageRecord[]) || [];
    const messages = rawMessages.map((msg) => ({
      ...msg,
      content: this.chatCryptoService.decryptMessage(msg.content, roomKey),
    }));

    return {
      messages,
      nextCursor:
        messages.length === limit
          ? messages[messages.length - 1].createdAt
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

    // 4. Ensure the room exists idempotently with its wrapped DEK
    let room: {
      id: string;
      userOneId: string;
      userTwoId: string;
      wrappedRoomKey: string;
      roomKeyId: string;
    } | null = null;
    let roomKey: Buffer | null = null;

    try {
      // 4a. Fetch existing room if present
      const existing = await this.supabase
        .from('ChatRoom')
        .select('id, userOneId, userTwoId, wrappedRoomKey, roomKeyId')
        .eq('userOneId', userOneId)
        .eq('userTwoId', userTwoId)
        .maybeSingle();

      if (existing.data) {
        room = existing.data as {
          id: string;
          userOneId: string;
          userTwoId: string;
          wrappedRoomKey: string;
          roomKeyId: string;
        };
      } else {
        // 4b. Create new room with fresh wrapped room DEK
        const rawKey = this.chatCryptoService.generateRoomKey();
        const { wrappedRoomKey, roomKeyId } =
          this.chatCryptoService.wrapRoomKey(rawKey);

        const response = await this.supabase
          .from('ChatRoom')
          .insert({
            userOneId,
            userTwoId,
            wrappedRoomKey,
            roomKeyId,
          })
          .select('id, userOneId, userTwoId, wrappedRoomKey, roomKeyId')
          .single();

        if (response.data) {
          room = response.data as {
            id: string;
            userOneId: string;
            userTwoId: string;
            wrappedRoomKey: string;
            roomKeyId: string;
          };
          roomKey = rawKey;
        } else if (response.error) {
          // Handle concurrent creation race condition (unique constraint hit on userOneId, userTwoId)
          const fallback = await this.supabase
            .from('ChatRoom')
            .select('id, userOneId, userTwoId, wrappedRoomKey, roomKeyId')
            .eq('userOneId', userOneId)
            .eq('userTwoId', userTwoId)
            .single();

          if (fallback.data) {
            room = fallback.data as {
              id: string;
              userOneId: string;
              userTwoId: string;
              wrappedRoomKey: string;
              roomKeyId: string;
            };
          } else {
            throw response.error;
          }
        }
      }
    } catch (err: unknown) {
      this.logger.error('Failed to process chat room', {
        senderId,
        targetUserId,
        step: 'get_or_create_room',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to process chat room');
    }

    if (!room) {
      this.logger.error(
        'Failed to process chat room: room not found or created',
        {
          senderId,
          targetUserId,
          step: 'get_or_create_room',
        },
      );
      throw new InternalServerErrorException('Failed to process chat room');
    }

    // Resolve room DEK (use rawKey directly if generated, or unwrap from existing room)
    if (!roomKey) {
      roomKey = this.getOrUnwrapRoomKey(room);
    }

    // Encrypt message content strictly
    const encryptedContent = this.chatCryptoService.encryptMessage(
      content,
      roomKey,
    );

    // 5. Insert the message with encrypted content
    let data: unknown;
    let msgError;
    try {
      const response = await this.supabase
        .from('Message')
        .insert({
          roomId: room.id,
          senderId,
          content: encryptedContent,
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

    // 6. Emit domain event for notification dispatch (with plaintext content for previews)
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

    return {
      ...message,
      content,
    };
  }

  async markMessageRead(
    userId: string,
    roomOrId: ChatRoomRecord | string,
    dto: MarkMessageReadRequestDto,
  ) {
    // Enforce participant authorization before marking messages read (skipped if pre-validated by guard)
    const room =
      typeof roomOrId === 'string'
        ? await this.assertRoomParticipant(userId, roomOrId)
        : roomOrId;
    const roomId = room.id;

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
   * Deletes one or more messages sent by the calling participant from the specified chat room.
   *
   * @param userId - ID of the calling user.
   * @param roomOrId - Chat room record (pre-validated by guard) or room ID string.
   * @param dto - Request payload containing message UUIDs to delete.
   * @returns Object indicating success and the count of deleted messages.
   * @throws {ChatRoomNotFoundException} If the room does not exist.
   * @throws {ChatRoomAccessForbiddenException} If the user is not a participant in the room.
   * @throws {MessageNotFoundException} If any requested message is not found in the room.
   * @throws {MessageDeletionForbiddenException} If any message was sent by another participant.
   */
  async deleteMessages(
    userId: string,
    roomOrId: ChatRoomRecord | string,
    dto: DeleteMessagesRequestDto,
  ): Promise<DeleteMessagesResponseDto> {
    // 1. Enforce participant authorization before processing deletion (skipped if pre-validated by guard)
    const room =
      typeof roomOrId === 'string'
        ? await this.assertRoomParticipant(userId, roomOrId)
        : roomOrId;
    const roomId = room.id;

    // 2. Fetch the candidate messages to verify existence, room alignment, and ownership
    let messages: Array<{ id: string; senderId: string; roomId: string }>;
    let fetchError;
    try {
      const response = await this.supabase
        .from('Message')
        .select('id, senderId, roomId')
        .eq('roomId', roomId)
        .in('id', dto.messageIds);
      messages = response.data as Array<{
        id: string;
        senderId: string;
        roomId: string;
      }>;
      fetchError = response.error;
    } catch (err: unknown) {
      this.logger.error('Failed to fetch messages for deletion', {
        roomId,
        userId,
        messageIds: dto.messageIds,
        step: 'delete_messages',
        err: serializeError(err),
      });
      throw new InternalServerErrorException(
        'Failed to verify messages for deletion',
      );
    }

    if (fetchError || !messages) {
      this.logger.error('Failed to fetch messages for deletion', {
        roomId,
        userId,
        messageIds: dto.messageIds,
        step: 'delete_messages',
        err: serializeError(fetchError),
      });
      throw new InternalServerErrorException(
        'Failed to verify messages for deletion',
      );
    }

    // 3. Verify all requested messages were found
    const foundIds = new Set(messages.map((m) => m.id));
    const missingId = dto.messageIds.find((id) => !foundIds.has(id));
    if (missingId) {
      this.logger.warn('Message not found for deletion', {
        missingId,
        roomId,
        userId,
        step: 'delete_messages',
      });
      throw new MessageNotFoundException(missingId);
    }

    // 4. Verify sender authorization: caller can only delete messages they sent
    const unauthorizedMessage = messages.find((m) => m.senderId !== userId);
    if (unauthorizedMessage) {
      this.logger.warn(
        'User attempted to delete a message sent by another participant',
        {
          userId,
          roomId,
          messageId: unauthorizedMessage.id,
          senderId: unauthorizedMessage.senderId,
          step: 'delete_messages',
        },
      );
      throw new MessageDeletionForbiddenException(unauthorizedMessage.id);
    }

    // 5. Execute deletion in Supabase datastore
    let deleteError;
    let count: number | null = null;
    try {
      const response = await this.supabase
        .from('Message')
        .delete({ count: 'exact' })
        .eq('roomId', roomId)
        .eq('senderId', userId)
        .in('id', dto.messageIds);
      deleteError = response.error;
      count = response.count;
    } catch (err: unknown) {
      this.logger.error('Exception during message deletion', {
        roomId,
        userId,
        messageIds: dto.messageIds,
        step: 'delete_messages',
        err: serializeError(err),
      });
      throw new InternalServerErrorException('Failed to delete messages');
    }

    if (deleteError) {
      this.logger.error('Failed to delete messages', {
        roomId,
        userId,
        messageIds: dto.messageIds,
        step: 'delete_messages',
        err: serializeError(deleteError),
      });
      throw new InternalServerErrorException('Failed to delete messages');
    }

    const deletedCount = count ?? dto.messageIds.length;

    this.logger.event(LOG_EVENT.CHAT_MESSAGES_DELETED, {
      userId,
      roomId,
      deletedCount,
      messageIds: dto.messageIds,
    });

    return {
      success: true,
      deletedCount,
    };
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

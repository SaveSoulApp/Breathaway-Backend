import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MatchStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  createPrismaMock,
  MockPrismaService,
} from '@infrastructure/database/tests/mocks/prisma.mock';
import { BlocksService } from '@modules/blocks/blocks.service';
import { UserDeletedEvent } from '@modules/profiles/events';

import {
  ActiveMatchRequiredException,
  ChatRoomAccessForbiddenException,
  ChatRoomNotFoundException,
  MessageNotFoundException,
  SelfMessageException,
  UserBlockedException,
} from '../application/exceptions';
import { ChatsService } from '../chats.service';
import * as chatUtils from '../utils/chats.utils';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('ChatsService', () => {
  let service: ChatsService;
  let prisma: MockPrismaService;
  let blocksService: { isBlocked: jest.Mock };

  let mockSupabaseClient: any;

  let mockChatRoomQuery: any;

  let mockMessageQuery: any;

  const contextualLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
    verbose: jest.fn(),
  };

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue(contextualLogger),
  };

  beforeEach(async () => {
    mockChatRoomQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    mockMessageQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
    };

    mockSupabaseClient = {
      from: jest.fn((table: string) => {
        if (table === 'ChatRoom') return mockChatRoomQuery;
        if (table === 'Message') return mockMessageQuery;
        return mockChatRoomQuery;
      }),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

    blocksService = {
      isBlocked: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: BlocksService, useValue: blocksService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SUPABASE_URL') return 'http://localhost';
              if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ChatsService>(ChatsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertRoomParticipant', () => {
    it('should throw ChatRoomNotFoundException if room does not exist', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.getMessages('user-1', 'room-unknown', {}),
      ).rejects.toThrow(ChatRoomNotFoundException);
    });

    it('should throw ChatRoomAccessForbiddenException if user is not in the room', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-2', userTwoId: 'user-3' },
        error: null,
      });

      await expect(
        service.getMessages('user-attacker', 'room-1', {}),
      ).rejects.toThrow(ChatRoomAccessForbiddenException);
    });

    it('should throw InternalServerErrorException on database error during participant check', async () => {
      mockChatRoomQuery.single.mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(service.getMessages('user-1', 'room-1', {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getMessages', () => {
    it('should return messages and no nextCursor if fewer than limit', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });

      const mockMessages = [{ id: '1', createdAt: 'date1' }];
      mockMessageQuery.limit.mockResolvedValueOnce({
        data: mockMessages,
        error: null,
      });

      const result = await service.getMessages('user-1', 'room-1', {
        limit: 20,
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ChatRoom');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('Message');
      expect(result.messages).toEqual(mockMessages);
      expect(result.nextCursor).toBeNull();
    });

    it('should return nextCursor if messages length equals limit', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });

      const mockMessages = [
        { id: '1', createdAt: 'date1' },
        { id: '2', createdAt: 'date2' },
      ];
      mockMessageQuery.limit.mockResolvedValueOnce({
        data: mockMessages,
        error: null,
      });

      const result = await service.getMessages('user-1', 'room-1', {
        limit: 2,
      });

      expect(result.messages).toEqual(mockMessages);
      expect(result.nextCursor).toBe('date2');
    });

    it('should throw InternalServerErrorException on supabase error', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });

      mockMessageQuery.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB Error' },
      });

      await expect(service.getMessages('user-1', 'room-1', {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('sendMessage', () => {
    it('should throw SelfMessageException if senderId equals targetUserId', async () => {
      await expect(
        service.sendMessage('user-1', {
          targetUserId: 'user-1',
          content: 'Hello self',
        }),
      ).rejects.toThrow(SelfMessageException);
    });

    it('should throw UserBlockedException if an active block exists', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(true);

      await expect(
        service.sendMessage('user-1', {
          targetUserId: 'user-2',
          content: 'Hello',
        }),
      ).rejects.toThrow(UserBlockedException);

      expect(blocksService.isBlocked).toHaveBeenCalledWith('user-1', 'user-2');
    });

    it('should throw ActiveMatchRequiredException if no active match exists', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.sendMessage('user-1', {
          targetUserId: 'user-2',
          content: 'Hello',
        }),
      ).rejects.toThrow(ActiveMatchRequiredException);

      expect(prisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { userOneId: 'user-1', userTwoId: 'user-2' },
            { userOneId: 'user-2', userTwoId: 'user-1' },
          ],
          status: MatchStatus.ACTIVE,
          deletedAt: null,
          userOne: { deletedAt: null },
          userTwo: { deletedAt: null },
        },
        select: { id: true },
      });
    });

    it('should send a message and trigger push notification when authorized', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      const mockRoom = { id: 'room-1' };
      const mockMessage = { id: 'msg-1', content: 'hello' };

      jest.spyOn(chatUtils, 'generateRoomParticipants').mockReturnValue({
        userOneId: 'user-1',
        userTwoId: 'user-2',
      });

      // Mock upsert for room
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: mockRoom,
        error: null,
      });
      // Mock insert for message
      mockMessageQuery.single.mockResolvedValueOnce({
        data: mockMessage,
        error: null,
      });

      const result = await service.sendMessage('user-1', {
        targetUserId: 'user-2',
        content: 'hello',
      });

      expect(result).toEqual(mockMessage);
      expect(mockChatRoomQuery.upsert).toHaveBeenCalledWith(
        { userOneId: 'user-1', userTwoId: 'user-2' },
        { onConflict: 'userOneId, userTwoId' },
      );
      expect(mockMessageQuery.insert).toHaveBeenCalledWith({
        roomId: 'room-1',
        senderId: 'user-1',
        content: 'hello',
      });
    });

    it('should throw InternalServerErrorException on room upsert failure', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Upsert error' },
      });

      await expect(
        service.sendMessage('user-1', {
          targetUserId: 'user-2',
          content: 'hello',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException on message insert failure', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1' },
        error: null,
      });
      mockMessageQuery.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert error' },
      });

      await expect(
        service.sendMessage('user-1', {
          targetUserId: 'user-2',
          content: 'hello',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('markMessageRead', () => {
    it('should throw ChatRoomAccessForbiddenException if user is not in the room', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-2', userTwoId: 'user-3' },
        error: null,
      });

      await expect(
        service.markMessageRead('user-attacker', 'room-1', {
          messageId: 'msg-1',
        }),
      ).rejects.toThrow(ChatRoomAccessForbiddenException);
    });

    it('should throw MessageNotFoundException if reference message not found', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });
      // Fetch reference message
      mockMessageQuery.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.markMessageRead('user-1', 'room-1', { messageId: 'msg-1' }),
      ).rejects.toThrow(MessageNotFoundException);
    });

    it('should update messages correctly when user is participant', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });

      const mockRefMessage = { createdAt: '2023-01-01' };
      // Fetch reference message
      mockMessageQuery.single.mockResolvedValueOnce({
        data: mockRefMessage,
        error: null,
      });
      // Mock update response
      mockMessageQuery.lte.mockResolvedValueOnce({ error: null });

      const result = await service.markMessageRead('user-1', 'room-1', {
        messageId: 'msg-1',
      });

      expect(result).toEqual({ success: true });
      expect(mockMessageQuery.update).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException on update failure', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        error: null,
      });

      mockMessageQuery.single.mockResolvedValueOnce({
        data: { createdAt: '2023-01-01' },
        error: null,
      });
      mockMessageQuery.lte.mockResolvedValueOnce({
        error: { message: 'Update failed' },
      });

      await expect(
        service.markMessageRead('user-1', 'room-1', { messageId: 'msg-1' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getRooms', () => {
    it('should return enriched rooms and filter out rooms with blocked users', async () => {
      const mockRooms = [
        { id: 'room-1', userOneId: 'user-1', userTwoId: 'user-2' },
        { id: 'room-2', userOneId: 'user-1', userTwoId: 'user-blocked' },
      ];

      mockChatRoomQuery.limit.mockResolvedValueOnce({
        data: mockRooms,
        error: null,
      });

      (prisma.block.findMany as jest.Mock).mockResolvedValueOnce([
        { blockerUserId: 'user-1', blockedUserId: 'user-blocked' },
      ]);

      (prisma.userProfile.findMany as jest.Mock).mockResolvedValueOnce([
        { userId: 'user-2', firstName: 'Alice', lastName: 'Smith' },
      ]);

      const result = await service.getRooms('user-1', { limit: 20 });

      expect(result.rooms).toHaveLength(1);
      expect(result.rooms[0].id).toBe('room-1');
      expect(result.rooms[0].otherUser).toEqual({
        id: 'user-2',
        firstName: 'Alice',
        lastName: 'Smith',
      });
    });
  });

  describe('handleUserDeletedEvent', () => {
    it('should trigger deletion of user chat rooms', async () => {
      mockChatRoomQuery.or.mockResolvedValueOnce({ error: null });

      await service.handleUserDeletedEvent(
        new UserDeletedEvent('user-deleted'),
      );

      expect(mockChatRoomQuery.delete).toHaveBeenCalled();
    });
  });
});

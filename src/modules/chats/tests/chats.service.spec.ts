import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MatchStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
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
  MessageDeletionForbiddenException,
  MessageNotFoundException,
  SelfMessageException,
  UserBlockedException,
} from '../application/exceptions';
import { ChatsService } from '../chats.service';
import { CHAT_MESSAGE_SENT_EVENT } from '../events';
import { ChatRoomRecord } from '../interfaces';
import { ChatCryptoService } from '../services/chat-crypto.service';
import * as chatUtils from '../utils/chats.utils';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('ChatsService', () => {
  let service: ChatsService;
  let prisma: MockPrismaService;
  let blocksService: { isBlocked: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

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
      maybeSingle: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
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
      delete: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
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

    const mockIdentityCryptoService = {
      decryptText: jest.fn().mockImplementation((val?: string | null) => {
        if (!val) return Promise.resolve(null);
        if (val.startsWith('enc:v1:')) {
          const parts = val.split(':');
          return Promise.resolve(parts[parts.length - 1]);
        }
        return Promise.resolve(val);
      }),
    };

    const mockChatCryptoService = {
      generateRoomKey: jest.fn().mockReturnValue(Buffer.alloc(32, 1)),
      wrapRoomKey: jest.fn().mockReturnValue({
        wrappedRoomKey: 'mock-wrapped-key',
        roomKeyId: 'chat-v1',
      }),
      unwrapRoomKey: jest.fn().mockReturnValue(Buffer.alloc(32, 1)),
      encryptMessage: jest
        .fn()
        .mockImplementation((msg: string) => `enc:v1:iv:tag:${msg}`),
      decryptMessage: jest.fn().mockImplementation((val: string) => {
        if (val && val.startsWith('enc:v1:')) {
          const parts = val.split(':');
          return parts[parts.length - 1];
        }
        return val;
      }),
      isEncryptedMessage: jest
        .fn()
        .mockImplementation((val?: string | null) =>
          Boolean(val?.startsWith('enc:v1:')),
        ),
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
          provide: IdentityCryptoService,
          useValue: mockIdentityCryptoService,
        },
        {
          provide: ChatCryptoService,
          useValue: mockChatCryptoService,
        },
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
    eventEmitter = module.get(EventEmitter2);
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
    it('should return messages, decrypt contents, and no nextCursor if fewer than limit', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        },
        error: null,
      });

      const mockMessages = [
        {
          id: '1',
          content: 'enc:v1:iv:tag:decrypted-hello',
          createdAt: 'date1',
        },
      ];
      mockMessageQuery.limit.mockResolvedValueOnce({
        data: mockMessages,
        error: null,
      });

      const result = await service.getMessages('user-1', 'room-1', {
        limit: 20,
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ChatRoom');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('Message');
      expect(result.messages).toEqual([
        { id: '1', content: 'decrypted-hello', createdAt: 'date1' },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('should return nextCursor if messages length equals limit', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        },
        error: null,
      });

      const mockMessages = [
        { id: '1', content: 'plain-1', createdAt: 'date1' },
        { id: '2', content: 'plain-2', createdAt: 'date2' },
      ];
      mockMessageQuery.limit.mockResolvedValueOnce({
        data: mockMessages,
        error: null,
      });

      const result = await service.getMessages('user-1', 'room-1', {
        limit: 2,
      });

      expect(result.messages).toEqual([
        { id: '1', content: 'plain-1', createdAt: 'date1' },
        { id: '2', content: 'plain-2', createdAt: 'date2' },
      ]);
      expect(result.nextCursor).toBe('date2');
    });

    it('should throw InternalServerErrorException on supabase error', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        },
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

  describe('getRoomKey', () => {
    it('should return room encryption key for authorized participant', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        },
        error: null,
      });

      blocksService.isBlocked.mockResolvedValueOnce(false);

      const result = await service.getRoomKey('user-1', 'room-1');

      expect(result.roomId).toBe('room-1');
      expect(typeof result.key).toBe('string');
      expect(result.algorithm).toBe('AES-GCM-256');
    });

    it('should bypass room query and return key when ChatRoomRecord is passed directly', async () => {
      const mockRecord: ChatRoomRecord = {
        id: 'room-prevalidated',
        userOneId: 'user-1',
        userTwoId: 'user-2',
        wrappedRoomKey: 'mock-wrapped-key',
        roomKeyId: 'chat-v1',
      };

      blocksService.isBlocked.mockResolvedValueOnce(false);

      const result = await service.getRoomKey('user-1', mockRecord);

      expect(mockChatRoomQuery.single).not.toHaveBeenCalled();
      expect(result.roomId).toBe('room-prevalidated');
      expect(typeof result.key).toBe('string');
      expect(result.algorithm).toBe('AES-GCM-256');
    });

    it('should throw UserBlockedException if users have an active block', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        },
        error: null,
      });

      blocksService.isBlocked.mockResolvedValueOnce(true);

      await expect(service.getRoomKey('user-1', 'room-1')).rejects.toThrow(
        UserBlockedException,
      );
    });

    it('should throw InternalServerErrorException if room has missing wrapped key', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-corrupt',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: null,
          roomKeyId: null,
        },
        error: null,
      });

      blocksService.isBlocked.mockResolvedValueOnce(false);

      await expect(
        service.getRoomKey('user-1', 'room-corrupt'),
      ).rejects.toThrow(InternalServerErrorException);
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

    it('should send a message and trigger push notification when room already exists', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      const mockRoom = {
        id: 'room-1',
        userOneId: 'user-1',
        userTwoId: 'user-2',
        wrappedRoomKey: 'mock-wrapped-key',
        roomKeyId: 'chat-v1',
      };
      const mockMessage = { id: 'msg-1', content: 'enc:v1:iv:tag:hello' };

      jest.spyOn(chatUtils, 'generateRoomParticipants').mockReturnValue({
        userOneId: 'user-1',
        userTwoId: 'user-2',
      });

      // Existing room lookup
      mockChatRoomQuery.maybeSingle.mockResolvedValueOnce({
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

      expect(result).toEqual({ id: 'msg-1', content: 'hello' });
      expect(mockMessageQuery.insert).toHaveBeenCalledWith({
        roomId: 'room-1',
        senderId: 'user-1',
        content: 'enc:v1:iv:tag:hello',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        CHAT_MESSAGE_SENT_EVENT,
        expect.objectContaining({
          messageId: 'msg-1',
          roomId: 'room-1',
          matchId: 'match-1',
          senderId: 'user-1',
          recipientId: 'user-2',
          content: 'hello',
        }),
      );
    });

    it('should create room with key and send message when room does not exist', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      const mockRoom = {
        id: 'room-new',
        userOneId: 'user-1',
        userTwoId: 'user-2',
        wrappedRoomKey: 'mock-wrapped-key',
        roomKeyId: 'chat-v1',
      };
      const mockMessage = { id: 'msg-1', content: 'enc:v1:iv:tag:hello' };

      jest.spyOn(chatUtils, 'generateRoomParticipants').mockReturnValue({
        userOneId: 'user-1',
        userTwoId: 'user-2',
      });

      // No existing room
      mockChatRoomQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      // Room insert succeeds
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: mockRoom,
        error: null,
      });
      // Message insert
      mockMessageQuery.single.mockResolvedValueOnce({
        data: mockMessage,
        error: null,
      });

      const result = await service.sendMessage('user-1', {
        targetUserId: 'user-2',
        content: 'hello',
      });

      expect(result).toEqual({ id: 'msg-1', content: 'hello' });
      expect(mockChatRoomQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'mock-wrapped-key',
          roomKeyId: 'chat-v1',
        }),
      );
    });

    it('should throw InternalServerErrorException on room resolution failure', async () => {
      blocksService.isBlocked.mockResolvedValueOnce(false);
      (prisma.match.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'match-1',
      });

      mockChatRoomQuery.maybeSingle.mockRejectedValueOnce(
        new Error('Upsert error'),
      );

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

      const mockRoom = {
        id: 'room-1',
        userOneId: 'user-1',
        userTwoId: 'user-2',
        wrappedRoomKey: 'mock-wrapped-key',
        roomKeyId: 'chat-v1',
      };

      mockChatRoomQuery.maybeSingle.mockResolvedValueOnce({
        data: mockRoom,
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

  describe('deleteMessages', () => {
    it('should successfully delete a single message when user is sender and participant', async () => {
      // Room authorization
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      // Select candidate messages
      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-1', senderId: 'user-1', roomId: 'room-1' }],
        error: null,
      });

      // Delete execution
      mockMessageQuery.in.mockResolvedValueOnce({
        error: null,
        count: 1,
      });

      const result = await service.deleteMessages('user-1', 'room-1', {
        messageIds: ['msg-1'],
      });

      expect(result).toEqual({ success: true, deletedCount: 1 });
      expect(mockMessageQuery.delete).toHaveBeenCalledWith({ count: 'exact' });
      expect(contextualLogger.event).toHaveBeenCalledWith(
        'CHAT_MESSAGES_DELETED',
        expect.objectContaining({
          userId: 'user-1',
          roomId: 'room-1',
          deletedCount: 1,
          messageIds: ['msg-1'],
        }),
      );
    });

    it('should successfully delete multiple messages (batch)', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [
          { id: 'msg-1', senderId: 'user-1', roomId: 'room-1' },
          { id: 'msg-2', senderId: 'user-1', roomId: 'room-1' },
        ],
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        error: null,
        count: 2,
      });

      const result = await service.deleteMessages('user-1', 'room-1', {
        messageIds: ['msg-1', 'msg-2'],
      });

      expect(result).toEqual({ success: true, deletedCount: 2 });
    });

    it('should fallback to messageIds.length if count returned from delete is null', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-1', senderId: 'user-1', roomId: 'room-1' }],
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        error: null,
        count: null,
      });

      const result = await service.deleteMessages('user-1', 'room-1', {
        messageIds: ['msg-1'],
      });

      expect(result).toEqual({ success: true, deletedCount: 1 });
    });

    it('should throw ChatRoomNotFoundException if room does not exist', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.deleteMessages('user-1', 'room-nonexistent', {
          messageIds: ['msg-1'],
        }),
      ).rejects.toThrow(ChatRoomNotFoundException);
    });

    it('should throw ChatRoomAccessForbiddenException if user is not a participant', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-2',
          userTwoId: 'user-3',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1'],
        }),
      ).rejects.toThrow(ChatRoomAccessForbiddenException);
    });

    it('should throw MessageNotFoundException if no requested messages exist in room', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1'],
        }),
      ).rejects.toThrow(MessageNotFoundException);
    });

    it('should throw MessageNotFoundException if one message in batch is missing', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-1', senderId: 'user-1', roomId: 'room-1' }],
        error: null,
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1', 'msg-2'],
        }),
      ).rejects.toThrow(MessageNotFoundException);
    });

    it('should throw MessageDeletionForbiddenException if attempting to delete another user message', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-2', senderId: 'user-2', roomId: 'room-1' }],
        error: null,
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-2'],
        }),
      ).rejects.toThrow(MessageDeletionForbiddenException);
    });

    it('should throw InternalServerErrorException if fetching messages returns an error', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database fetch failure' },
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1'],
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if delete query returns an error', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-1', senderId: 'user-1', roomId: 'room-1' }],
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        error: { message: 'Database delete failure' },
      });

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1'],
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if delete query throws an unhandled exception', async () => {
      mockChatRoomQuery.single.mockResolvedValueOnce({
        data: {
          id: 'room-1',
          userOneId: 'user-1',
          userTwoId: 'user-2',
          wrappedRoomKey: 'key',
          roomKeyId: 'chat_v1',
        },
        error: null,
      });

      mockMessageQuery.in.mockResolvedValueOnce({
        data: [{ id: 'msg-1', senderId: 'user-1', roomId: 'room-1' }],
        error: null,
      });

      mockMessageQuery.in.mockRejectedValueOnce(new Error('Network drop'));

      await expect(
        service.deleteMessages('user-1', 'room-1', {
          messageIds: ['msg-1'],
        }),
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

    it('should throw InternalServerErrorException if fetching rooms throws an error', async () => {
      mockChatRoomQuery.limit.mockRejectedValueOnce(new Error('DB failure'));

      await expect(service.getRooms('user-1', { limit: 20 })).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException if fetching rooms returns an error object', async () => {
      mockChatRoomQuery.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getRooms('user-1', { limit: 20 })).rejects.toThrow(
        InternalServerErrorException,
      );
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

    it('should log error when deleting rooms returns an error', async () => {
      mockChatRoomQuery.or.mockResolvedValueOnce({
        error: { message: 'Deletion error' },
      });

      await service.handleUserDeletedEvent(
        new UserDeletedEvent('user-deleted'),
      );

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Failed to delete chat rooms for deleted user',
        expect.objectContaining({ userId: 'user-deleted' }),
      );
    });

    it('should log error when deleting rooms throws an exception', async () => {
      mockChatRoomQuery.or.mockRejectedValueOnce(new Error('Crash'));

      await service.handleUserDeletedEvent(
        new UserDeletedEvent('user-deleted'),
      );

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Exception while deleting chat rooms for user',
        expect.objectContaining({ userId: 'user-deleted' }),
      );
    });
  });
});

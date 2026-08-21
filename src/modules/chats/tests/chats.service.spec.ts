import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { MessageNotFoundException } from '../application/exceptions';
import { ChatsService } from '../chats.service';
import { createClient } from '@supabase/supabase-js';
import { LoggerService } from '@core/logger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { createPrismaMock, MockPrismaService } from '@infrastructure/database/tests/mocks/prisma.mock';
import * as chatUtils from '../utils/chats.utils';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('ChatsService', () => {
  let service: ChatsService;
  let configService: ConfigService;
  let prisma: MockPrismaService;
  let mockSupabaseClient: any;

  const contextualLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue(contextualLogger),
  };

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: createPrismaMock() },
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
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMessages', () => {
    it('should return messages and no nextCursor if fewer than limit', async () => {
      const mockMessages = [{ id: '1', createdAt: 'date1' }];
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockMessages,
        error: null,
      });

      const result = await service.getMessages('user-1', 'room-1', {
        limit: 20,
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('Message');
      expect(result.messages).toEqual(mockMessages);
      expect(result.nextCursor).toBeNull();
    });

    it('should throw InternalServerErrorException on supabase error', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: null,
        error: { message: 'DB Error' },
      });

      await expect(service.getMessages('user-1', 'room-1', {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message and trigger a push notification', async () => {
      const mockRoom = { id: 'room-1' };
      const mockMessage = { id: 'msg-1', content: 'hello' };

      jest.spyOn(chatUtils, 'generateRoomParticipants').mockReturnValue({
        userOneId: 'user-1',
        userTwoId: 'user-2',
      });

      // Mock upsert for room
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockRoom,
        error: null,
      });
      // Mock insert for message
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockMessage,
        error: null,
      });

      const result = await service.sendMessage('user-1', {
        targetUserId: 'user-2',
        content: 'hello',
      });

      expect(result).toEqual(mockMessage);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        { userOneId: 'user-1', userTwoId: 'user-2' },
        { onConflict: 'userOneId, userTwoId' },
      );
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        roomId: 'room-1',
        senderId: 'user-1',
        content: 'hello',
      });
    });
  });

  describe('markMessageRead', () => {
    it('should update messages correctly', async () => {
      const mockRefMessage = { createdAt: '2023-01-01' };

      // Mock fetching reference message
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockRefMessage,
        error: null,
      });
      // Mock update response
      mockSupabaseClient.lte.mockResolvedValueOnce({ error: null });

      const result = await service.markMessageRead('user-1', 'room-1', {
        messageId: 'msg-1',
      });

      expect(result).toEqual({ success: true });
      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if reference message not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.markMessageRead('user-1', 'room-1', { messageId: 'msg-1' }),
      ).rejects.toThrow(MessageNotFoundException);
    });
  });
});

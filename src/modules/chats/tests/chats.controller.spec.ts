import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@core/logger';
import { ChatsController } from '../chats.controller';
import { ChatsService } from '../chats.service';
import { SupabaseAuthService } from '../services/supabase-auth.service';
import { CreateMessageRequestDto } from '../dto/request/create-message.request.dto';
import { MarkMessageReadRequestDto } from '../dto/request/mark-message-read.request.dto';
import { GetMessagesRequestDto } from '../dto/request/get-messages.request.dto';

describe('ChatsController', () => {
  let controller: ChatsController;
  let chatsService: jest.Mocked<ChatsService>;
  let supabaseAuthService: jest.Mocked<SupabaseAuthService>;

  beforeEach(async () => {
    const mockChatsService = {
      sendMessage: jest.fn(),
      markMessageRead: jest.fn(),
      getMessages: jest.fn(),
    };

    const mockSupabaseAuthService = {
      generateToken: jest.fn(),
    };

    const mockLoggerService = {
      forContext: jest.fn().mockReturnThis(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatsController],
      providers: [
        { provide: ChatsService, useValue: mockChatsService },
        { provide: SupabaseAuthService, useValue: mockSupabaseAuthService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<ChatsController>(ChatsController);
    chatsService = module.get(ChatsService);
    supabaseAuthService = module.get(SupabaseAuthService);
  });

  describe('getSupabaseToken', () => {
    it('should return the token for the user', () => {
      const mockToken = 'mock-jwt-token';
      supabaseAuthService.generateToken.mockReturnValue(mockToken);

      const result = controller.getSupabaseToken('user-1');

      expect(supabaseAuthService.generateToken).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ token: mockToken });
    });
  });

  describe('sendMessage', () => {
    it('should delegate to chatsService and return the message', async () => {
      const mockDto: CreateMessageRequestDto = {
        targetUserId: 'user-2',
        content: 'hello',
      };
      const mockMessage = { id: 'msg-1', content: 'hello' };

      chatsService.sendMessage.mockResolvedValue(mockMessage as any);

      const result = await controller.sendMessage('user-1', mockDto);

      expect(chatsService.sendMessage).toHaveBeenCalledWith('user-1', mockDto);
      expect(result).toEqual(mockMessage);
    });
  });

  describe('markMessagesRead', () => {
    it('should delegate to chatsService and return success', async () => {
      const mockDto: MarkMessageReadRequestDto = { messageId: 'msg-1' };

      chatsService.markMessageRead.mockResolvedValue({ success: true } as any);

      const result = await controller.markMessagesRead(
        'user-1',
        'room-1',
        mockDto,
      );

      expect(chatsService.markMessageRead).toHaveBeenCalledWith(
        'user-1',
        'room-1',
        mockDto,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('getMessages', () => {
    it('should delegate to chatsService and return messages', async () => {
      const mockQuery: GetMessagesRequestDto = { limit: 20 };
      const mockResponse = { messages: [], nextCursor: null };

      chatsService.getMessages.mockResolvedValue(mockResponse as any);

      const result = await controller.getMessages(
        'user-1',
        'room-1',
        mockQuery,
      );

      expect(chatsService.getMessages).toHaveBeenCalledWith(
        'user-1',
        'room-1',
        mockQuery,
      );
      expect(result).toEqual(mockResponse);
    });
  });
});

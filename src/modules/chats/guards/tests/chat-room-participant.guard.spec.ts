import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { LoggerService } from '@core/logger';
import {
  ChatRoomAccessForbiddenException,
  ChatRoomNotFoundException,
} from '@modules/chats/application/exceptions';
import { ChatsService } from '@modules/chats/chats.service';
import { ChatRoomRecord } from '@modules/chats/interfaces';

import { ChatRoomParticipantGuard } from '../chat-room-participant.guard';

describe('ChatRoomParticipantGuard', () => {
  let guard: ChatRoomParticipantGuard;
  let chatsService: jest.Mocked<ChatsService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };

  const mockRoom: ChatRoomRecord = {
    id: 'room-1',
    userOneId: 'user-1',
    userTwoId: 'user-2',
    wrappedRoomKey: 'd3JhcHBlZEtleQ==',
    roomKeyId: 'chat_v1',
  };

  beforeEach(async () => {
    const mockChatsService = {
      assertRoomParticipant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRoomParticipantGuard,
        { provide: ChatsService, useValue: mockChatsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    guard = module.get<ChatRoomParticipantGuard>(ChatRoomParticipantGuard);
    chatsService = module.get(ChatsService);
  });

  const createMockContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('should return true and attach chatRoom to request for authorized participant', async () => {
    const request: any = {
      user: { userId: 'user-1' },
      params: { roomId: 'room-1' },
    };
    chatsService.assertRoomParticipant.mockResolvedValueOnce(mockRoom);

    const context = createMockContext(request);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(chatsService.assertRoomParticipant).toHaveBeenCalledWith(
      'user-1',
      'room-1',
    );
    expect(request.chatRoom).toEqual(mockRoom);
  });

  it('should throw UnauthorizedException when user payload is missing from request', async () => {
    const request: any = {
      params: { roomId: 'room-1' },
    };

    const context = createMockContext(request);
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw BadRequestException when roomId parameter is missing', async () => {
    const request: any = {
      user: { userId: 'user-1' },
      params: {},
    };

    const context = createMockContext(request);
    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should propagate ChatRoomNotFoundException when room does not exist', async () => {
    const request: any = {
      user: { userId: 'user-1' },
      params: { roomId: 'room-nonexistent' },
    };
    chatsService.assertRoomParticipant.mockRejectedValueOnce(
      new ChatRoomNotFoundException('room-nonexistent'),
    );

    const context = createMockContext(request);
    await expect(guard.canActivate(context)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
  });

  it('should propagate ChatRoomAccessForbiddenException when caller is not a participant', async () => {
    const request: any = {
      user: { userId: 'user-intruder' },
      params: { roomId: 'room-1' },
    };
    chatsService.assertRoomParticipant.mockRejectedValueOnce(
      new ChatRoomAccessForbiddenException('room-1'),
    );

    const context = createMockContext(request);
    await expect(guard.canActivate(context)).rejects.toThrow(
      ChatRoomAccessForbiddenException,
    );
  });
});

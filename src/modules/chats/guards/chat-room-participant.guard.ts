import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedRequest } from '@common/decorators';
import { BaseGuard } from '@core/base';
import { LoggerService } from '@core/logger';

import { ChatsService } from '../chats.service';

/**
 * Route guard that enforces chat room participant authorization (IDOR defense).
 *
 * Verifies that the caller authenticated via JwtAuthGuard is an authorized participant
 * (`userOneId` or `userTwoId`) of the chat room specified by the `:roomId` route parameter.
 *
 * Upon successful authorization, attaches the retrieved chat room record to `request.chatRoom`
 * so downstream controllers and services can access room metadata without redundant database queries.
 *
 * @throws {UnauthorizedException} If caller authentication payload is missing.
 * @throws {BadRequestException} If the roomId route parameter is missing.
 * @throws {ChatRoomNotFoundException} If the room does not exist (HTTP 404).
 * @throws {ChatRoomAccessForbiddenException} If caller is not a participant (HTTP 403).
 */
@Injectable()
export class ChatRoomParticipantGuard extends BaseGuard implements CanActivate {
  constructor(
    loggerService: LoggerService,
    private readonly chatsService: ChatsService,
  ) {
    super(loggerService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    const roomId =
      typeof request.params?.roomId === 'string'
        ? request.params.roomId
        : undefined;

    if (!userId || typeof userId !== 'string') {
      this.logger.warn(
        'ChatRoomParticipantGuard: missing user payload in request context',
        { step: 'guard_check' },
      );
      throw new UnauthorizedException('User not authenticated');
    }

    if (!roomId) {
      this.logger.warn(
        'ChatRoomParticipantGuard: missing roomId route parameter',
        { step: 'guard_check', userId },
      );
      throw new BadRequestException('Chat room ID parameter is required');
    }

    const room = await this.chatsService.assertRoomParticipant(userId, roomId);
    request.chatRoom = room;

    return true;
  }
}

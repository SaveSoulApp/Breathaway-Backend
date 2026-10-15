import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ChatRoomRecord } from '@modules/chats/interfaces';

/**
 * Extracts the pre-validated ChatRoomRecord from the Express request.
 *
 * Must be used on route handlers protected by `ChatRoomParticipantGuard` which populates
 * the `request.chatRoom` property.
 *
 * @throws {InternalServerErrorException} If ChatRoomParticipantGuard was omitted or failed to populate request.chatRoom.
 */
export const CurrentChatRoom = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ChatRoomRecord => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.chatRoom) {
      throw new InternalServerErrorException(
        'Chat room missing from request context. Ensure ChatRoomParticipantGuard is applied.',
      );
    }

    return request.chatRoom;
  },
);

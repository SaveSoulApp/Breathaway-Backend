import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ChatRoomAccessForbiddenException extends DomainException {
  constructor(roomId: string) {
    super(`You are not a participant in chat room: ${roomId}`);
  }
}

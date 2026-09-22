import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ChatRoomNotFoundException extends DomainException {
  constructor(roomId: string) {
    super(`Chat room not found: ${roomId}`);
  }
}

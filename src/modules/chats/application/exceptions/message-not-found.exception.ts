import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MessageNotFoundException extends DomainException {
  constructor(messageId: string) {
    super(`Message not found: ${messageId}`);
  }
}

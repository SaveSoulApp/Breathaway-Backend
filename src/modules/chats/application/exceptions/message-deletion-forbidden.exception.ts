import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MessageDeletionForbiddenException extends DomainException {
  constructor(messageId?: string) {
    super(
      messageId
        ? `You are not authorized to delete message: ${messageId}`
        : 'You can only delete messages sent by yourself',
    );
  }
}

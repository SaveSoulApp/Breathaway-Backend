import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SelfMessageException extends DomainException {
  constructor() {
    super('You cannot send a chat message to yourself');
  }
}

import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidPubSubTokenException extends DomainException {
  constructor(message = 'Invalid Pub/Sub verification token') {
    super(message);
  }
}

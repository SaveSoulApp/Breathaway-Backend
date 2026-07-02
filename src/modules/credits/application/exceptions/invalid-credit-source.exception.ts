import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidCreditSourceException extends DomainException {
  constructor(message = 'Cannot manually grant LIKE_USAGE credits') {
    super(message);
  }
}

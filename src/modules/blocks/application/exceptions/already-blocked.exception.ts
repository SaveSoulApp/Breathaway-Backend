import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AlreadyBlockedException extends DomainException {
  constructor(message = 'User already blocked') {
    super(message);
  }
}

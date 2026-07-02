import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AccountAlreadyExistsException extends DomainException {
  constructor(message = 'Account with this credential already exists') {
    super(message);
  }
}

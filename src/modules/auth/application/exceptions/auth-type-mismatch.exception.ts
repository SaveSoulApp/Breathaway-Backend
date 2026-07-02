import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AuthTypeMismatchException extends DomainException {
  constructor(message = 'Token does not match the expected auth method') {
    super(message);
  }
}

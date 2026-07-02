import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UnverifiedAccountException extends DomainException {
  constructor(message = 'Account requires verification') {
    super(message);
  }
}

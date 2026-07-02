import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AccountNotFoundException extends DomainException {
  constructor(message = 'No account found with this credential') {
    super(message);
  }
}

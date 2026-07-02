import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class RegistrationPendingException extends DomainException {
  constructor(message = 'Registration is already pending for this credential') {
    super(message);
  }
}

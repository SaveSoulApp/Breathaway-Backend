import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class IdentityAlreadyInUseException extends DomainException {
  constructor(message = 'This identity is already in use by another account') {
    super(message);
  }
}

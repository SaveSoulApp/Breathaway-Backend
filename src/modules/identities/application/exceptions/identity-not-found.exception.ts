import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class IdentityNotFoundException extends DomainException {
  constructor(message = 'Identity not found') {
    super(message);
  }
}

import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class IdentityNotFoundException extends DomainException {
  constructor() {
    super('Target identity not found');
  }
}

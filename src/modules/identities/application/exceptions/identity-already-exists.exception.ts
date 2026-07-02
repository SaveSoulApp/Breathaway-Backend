import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class IdentityAlreadyExistsException extends DomainException {
  constructor(
    message = 'Another identity of this type with this value already exists',
  ) {
    super(message);
  }
}

import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UserNotFoundException extends DomainException {
  constructor(message = 'User not found') {
    super(message);
  }
}

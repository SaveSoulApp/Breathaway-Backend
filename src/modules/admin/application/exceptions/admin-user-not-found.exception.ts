import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AdminUserNotFoundException extends DomainException {
  constructor(message = 'User not found or already deleted') {
    super(message);
  }
}

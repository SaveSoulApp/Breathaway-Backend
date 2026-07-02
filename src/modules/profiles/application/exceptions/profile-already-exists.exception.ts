import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ProfileAlreadyExistsException extends DomainException {
  constructor(userId: string) {
    super(`Profile already exists for user: ${userId}`);
  }
}

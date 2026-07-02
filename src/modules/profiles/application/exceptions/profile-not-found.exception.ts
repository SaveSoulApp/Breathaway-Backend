import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ProfileNotFoundException extends DomainException {
  constructor(identifier: string) {
    super(`Profile not found: ${identifier}`);
  }
}

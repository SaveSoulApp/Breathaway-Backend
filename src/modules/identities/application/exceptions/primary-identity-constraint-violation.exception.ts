import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class PrimaryIdentityConstraintViolationException extends DomainException {
  constructor(message = 'Primary/Provider constraint violated') {
    super(message);
  }
}

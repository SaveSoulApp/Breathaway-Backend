import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UnsupportedSecondaryIdentityException extends DomainException {
  constructor(message = 'This credential type does not support secondary identities') {
    super(message);
  }
}

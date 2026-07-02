import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class PrimaryCredentialUnlinkException extends DomainException {
  constructor(message = 'The primary sign-in credential cannot be unlinked') {
    super(message);
  }
}

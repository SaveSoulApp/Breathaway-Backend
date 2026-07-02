import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class CredentialAlreadyLinkedException extends DomainException {
  constructor(message = 'Credential is already linked to a fully registered user') {
    super(message);
  }
}

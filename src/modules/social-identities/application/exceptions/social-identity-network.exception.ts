import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SocialIdentityNetworkException extends DomainException {
  constructor(message = 'Error connecting to Instagram validation service.') {
    super(message);
  }
}

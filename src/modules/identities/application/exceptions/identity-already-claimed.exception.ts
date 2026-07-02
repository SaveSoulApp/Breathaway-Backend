import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class IdentityAlreadyClaimedException extends DomainException {
  constructor(message = 'Identity already claimed by another user') {
    super(message);
  }
}

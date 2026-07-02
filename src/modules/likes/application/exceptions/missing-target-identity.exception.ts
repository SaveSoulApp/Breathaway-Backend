import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MissingTargetIdentityException extends DomainException {
  constructor() {
    super('Either targetIdentityId or targetIdentity must be provided');
  }
}

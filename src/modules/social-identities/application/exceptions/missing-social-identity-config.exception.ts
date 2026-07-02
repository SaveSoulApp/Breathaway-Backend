import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MissingSocialIdentityConfigException extends DomainException {
  constructor(message = 'Instagram verification is currently unavailable.') {
    super(message);
  }
}

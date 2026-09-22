import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UserBlockedException extends DomainException {
  constructor() {
    super('Cannot message this user due to a block relationship');
  }
}

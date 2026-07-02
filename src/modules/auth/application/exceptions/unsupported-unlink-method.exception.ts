import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UnsupportedUnlinkMethodException extends DomainException {
  constructor(message = 'Only email and phone credentials can be unlinked') {
    super(message);
  }
}

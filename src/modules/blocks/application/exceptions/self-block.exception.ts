import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SelfBlockException extends DomainException {
  constructor(message = 'You cannot block yourself') {
    super(message);
  }
}

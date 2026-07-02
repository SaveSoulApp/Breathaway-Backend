import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InsufficientCreditsException extends DomainException {
  constructor(message = 'Insufficient credits') {
    super(message);
  }
}

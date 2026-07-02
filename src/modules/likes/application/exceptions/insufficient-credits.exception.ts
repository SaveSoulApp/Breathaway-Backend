import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InsufficientCreditsException extends DomainException {
  constructor() {
    super('Insufficient credits');
  }
}

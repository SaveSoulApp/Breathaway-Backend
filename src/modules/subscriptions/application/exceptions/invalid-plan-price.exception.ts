import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidPlanPriceException extends DomainException {
  constructor(message = 'Invalid subscription plan price configuration') {
    super(message);
  }
}

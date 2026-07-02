import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidSubscriptionDatesException extends DomainException {
  constructor(message = 'expiresDate must be after purchaseDate') {
    super(message);
  }
}

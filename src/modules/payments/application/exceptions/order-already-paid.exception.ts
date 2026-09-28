import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when a PaymentOrder is already in PAID status and a re-verify
 * is attempted but should not trigger a duplicate grant.
 */
export class OrderAlreadyPaidException extends DomainException {
  constructor(message = 'Payment order has already been paid') {
    super(message);
  }
}

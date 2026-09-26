import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when a PaymentOrder cannot be found for the given ID and user.
 */
export class OrderNotFoundException extends DomainException {
  constructor(message = 'Payment order not found') {
    super(message);
  }
}

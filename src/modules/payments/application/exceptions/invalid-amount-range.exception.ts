import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when minAmount is greater than maxAmount for a payment route.
 */
export class InvalidAmountRangeException extends DomainException {
  constructor(minAmount: number, maxAmount: number) {
    super(
      `Invalid payment amount range: minAmount (${minAmount}) must be strictly less than maxAmount (${maxAmount}).`,
    );
  }
}

import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when an out-of-bounds priority step is requested.
 * Prevents arbitrary numbers (e.g. 900 or 1000) from being assigned.
 */
export class InvalidPriorityStepException extends DomainException {
  constructor(
    providedStep: number,
    minStep: number,
    maxStep: number,
    countryCode: string,
  ) {
    super(
      `Priority step ${providedStep} is invalid for country '${countryCode}'. Must be a contiguous step between ${minStep} and ${maxStep}.`,
    );
  }
}

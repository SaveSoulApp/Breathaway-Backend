import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when two gateways for the same country are configured with the same priority,
 * violating strict priority separation.
 */
export class DuplicatePriorityException extends DomainException {
  constructor(countryCode: string, priority: number) {
    super(
      `Priority ${priority} is already assigned to another gateway in country '${countryCode}'. Each gateway in a country must have a separate, unique priority.`,
    );
  }
}

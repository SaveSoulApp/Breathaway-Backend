import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when a batch reorder payload does not match the exact set of routes
 * configured for a given country.
 */
export class InvalidReorderPayloadException extends DomainException {
  constructor(
    message = 'Invalid reorder payload: routeIds must contain all routes for the specified country.',
  ) {
    super(message);
  }
}

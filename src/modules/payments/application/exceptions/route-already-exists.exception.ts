import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when attempting to create a PaymentGatewayRoute that already exists
 * for the given (countryCode, gateway) combination.
 */
export class RouteAlreadyExistsException extends DomainException {
  constructor(countryCode: string, gateway: string) {
    super(
      `Payment gateway route already exists for country '${countryCode}' and gateway '${gateway}'`,
    );
  }
}

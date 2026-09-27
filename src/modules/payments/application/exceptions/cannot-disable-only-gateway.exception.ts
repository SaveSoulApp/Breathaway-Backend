import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when attempting to disable the only active payment gateway route for a country.
 * Every country must retain at least one enabled route for payment processing.
 */
export class CannotDisableOnlyGatewayException extends DomainException {
  constructor(countryCode: string) {
    super(
      `Cannot disable the only active payment gateway for country '${countryCode}'. Every country must retain at least one enabled route.`,
    );
  }
}

import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when attempting to delete the only configured payment gateway route for a country.
 * Every country must retain at least one gateway route.
 */
export class CannotDeleteOnlyGatewayException extends DomainException {
  constructor(countryCode: string) {
    super(
      `Cannot delete the only payment gateway configured for country '${countryCode}'. Every country must retain at least one route.`,
    );
  }
}

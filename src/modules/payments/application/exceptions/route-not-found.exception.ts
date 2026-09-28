import { DomainException } from '@shared/domain/exceptions/domain.exception';

/**
 * Thrown when a PaymentGatewayRoute cannot be found for the given ID.
 */
export class RouteNotFoundException extends DomainException {
  constructor(id?: string) {
    super(
      id
        ? `Payment gateway route with ID '${id}' not found`
        : 'Payment gateway route not found',
    );
  }
}

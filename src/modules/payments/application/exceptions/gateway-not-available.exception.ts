import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when no active payment gateway route can be found for a country.
 */
export class GatewayNotAvailableException extends HttpException {
  constructor(countryCode: string) {
    super(
      `No payment gateway available for country "${countryCode}"`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

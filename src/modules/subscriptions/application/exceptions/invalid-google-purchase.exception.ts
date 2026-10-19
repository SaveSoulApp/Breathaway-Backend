import { UnauthorizedException } from '@nestjs/common';

/**
 * Thrown when an inbound Google Play purchase fails authoritative verification
 * against the Google Play Developer API, or when the purchase token is invalid or missing.
 */
export class InvalidGooglePurchaseException extends UnauthorizedException {
  constructor(
    message = 'Invalid Google purchase: verification against Google Play Developer API failed',
  ) {
    super(message);
  }
}

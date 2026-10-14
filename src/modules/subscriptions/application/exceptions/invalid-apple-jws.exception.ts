import { UnauthorizedException } from '@nestjs/common';

/**
 * Thrown when an inbound Apple StoreKit 2 JWS token fails cryptographic verification,
 * certificate chain validation, or claim checks.
 */
export class InvalidAppleJwsException extends UnauthorizedException {
  constructor(
    message = 'Invalid Apple JWS: cryptographic verification failed',
  ) {
    super(message);
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when the Razorpay (or other gateway) API call fails at order creation time.
 */
export class GatewayOrderCreationException extends HttpException {
  constructor(gateway: string, message: string) {
    super(
      `Gateway "${gateway}" failed to create order: ${message}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}

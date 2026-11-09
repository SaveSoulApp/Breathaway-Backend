import { seconds } from '@nestjs/throttler';

/**
 * Rate limits for payment order creation (`POST /api/v1/payments/orders`).
 *
 * Protects against upstream payment gateway rate-limit exhaustion (Razorpay/Cashfree),
 * database pending order bloat, and payment order DoS:
 * - short: 2 req / 1s (permits accidental double-clicks or quick re-attempts)
 * - medium: 5 req / 10s (prevents rapid order cycling)
 * - long: 10 req / 60s (caps order generation at 10 per minute per IP)
 */
export const PAYMENTS_ORDER_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

/**
 * Rate limits for payment signature verification (`POST /api/v1/payments/orders/:orderId/verify`).
 *
 * Protects against cryptographic HMAC brute-forcing, replay flooding, and credit fulfilment race conditions:
 * - short: 2 req / 1s (allows retry upon transient client network timeouts)
 * - medium: 5 req / 10s (mitigates rapid replay attempts)
 * - long: 15 req / 60s (strict cap on signature verification attempts per minute)
 */
export const PAYMENTS_VERIFY_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 15, ttl: seconds(60) },
};

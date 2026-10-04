import { seconds } from '@nestjs/throttler';

/**
 * Strict rate limits for sensitive authentication endpoints (signup, signin)
 * to mitigate automated credential stuffing, brute-force guessing, and bot account creation.
 *
 * - short: 1 req / 1s
 * - medium: 3 req / 10s
 * - long: 5 req / 60s
 */
export const AUTH_STRICT_THROTTLE = {
  short: { limit: 1, ttl: seconds(1) },
  medium: { limit: 3, ttl: seconds(10) },
  long: { limit: 5, ttl: seconds(60) },
};

/**
 * Rate limits for the token refresh endpoint (`POST /api/v1/auth/refresh`).
 *
 * Legitimate mobile clients refresh tokens once every 15 minutes.
 * Allows a burst of up to 2 calls in 1s (for concurrent app cold starts / tabs)
 * while strictly capping at 10 calls per minute to block brute-force token enumeration.
 *
 * - short: 2 req / 1s
 * - medium: 5 req / 10s
 * - long: 10 req / 60s
 */
export const AUTH_REFRESH_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

/**
 * Rate limits for developer testing login (`POST /api/v1/admin/dev-login`).
 *
 * - short: 2 req / 1s
 * - medium: 5 req / 10s
 * - long: 10 req / 60s
 */
export const AUTH_DEV_LOGIN_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

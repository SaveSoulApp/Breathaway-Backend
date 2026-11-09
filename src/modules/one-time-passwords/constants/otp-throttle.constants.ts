import { seconds } from '@nestjs/throttler';

/**
 * Strict rate limits for OTP generation (`POST /api/v1/one-time-passwords/generate`).
 *
 * OTP generation issues a short-lived, single-use token and sets a Redis lock.
 * Capping requests at:
 * - short: 1 req / 1s (prevents automated burst generation)
 * - medium: 2 req / 10s (prevents rapid generation attempts)
 * - long: 5 req / 60s (caps maximum generation frequency per minute)
 */
export const OTP_GENERATE_THROTTLE = {
  short: { limit: 1, ttl: seconds(1) },
  medium: { limit: 2, ttl: seconds(10) },
  long: { limit: 5, ttl: seconds(60) },
};

/**
 * Strict rate limits for OTP verification (`POST /api/v1/one-time-passwords/verify`).
 *
 * OTP verification validates a candidate slug against Redis hashes.
 * Strict limits protect against online brute-force and dictionary guessing:
 * - short: 2 req / 1s (allows quick user retry on typo)
 * - medium: 5 req / 10s (mitigates rapid guessing bursts)
 * - long: 10 req / 60s (hard cap on dictionary enumeration per minute)
 */
export const OTP_VERIFY_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

import { seconds } from '@nestjs/throttler';

/**
 * Strict rate limits for sensitive session revocation endpoints (remote device sign-out).
 *
 * Prevents rapid bursts of database writes and Redis eviction operations:
 * - short: 2 req / 1s
 * - medium: 5 req / 10s
 * - long: 10 req / 60s
 */
export const SESSIONS_REVOKE_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

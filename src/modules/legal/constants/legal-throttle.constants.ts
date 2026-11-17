import { seconds } from '@nestjs/throttler';

/**
 * Rate limits for legal consent recording (`POST /v1/legal/consents`).
 *
 * Restricts rapid write bursts to prevent automated consent ledger spamming
 * or connection pool exhaustion:
 * - short: 2 req / 1s
 * - medium: 5 req / 10s
 * - long: 10 req / 60s
 */
export const LEGAL_CONSENT_THROTTLE = {
  short: { limit: 2, ttl: seconds(1) },
  medium: { limit: 5, ttl: seconds(10) },
  long: { limit: 10, ttl: seconds(60) },
};

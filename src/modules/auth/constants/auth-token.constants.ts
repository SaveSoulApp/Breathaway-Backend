/**
 * Grace window in milliseconds during which a refresh token that was just rotated
 * can be presented again (e.g. concurrent requests on mobile cold starts, serverless SSR proxies,
 * bfcache restores, or network retries) and receive the exact same rotated token pair rather than
 * triggering family-wide session revocation.
 */
export const ROTATION_GRACE_PERIOD_MS = 10 * 1000; // 10 seconds

/**
 * TTL in seconds for caching the rotated auth response in Redis (Upstash).
 * Slightly exceeds ROTATION_GRACE_PERIOD_MS to ensure cache availability throughout the grace window.
 */
export const ROTATION_GRACE_TTL_SECONDS = 15; // 15 seconds

/**
 * Key prefix for caching rotated token responses in Redis / memory.
 */
export const AUTH_REFRESH_GRACE_PREFIX = 'auth:refresh:grace:';

/**
 * Delay in milliseconds between retry attempts when polling for an in-flight
 * concurrent rotation response after a Compare-and-Swap (CAS) update collision.
 */
export const CONCURRENT_ROTATION_WAIT_MS = 50;

/**
 * Maximum retry attempts to poll Redis / local cache for an in-flight rotation response
 * before concluding the operation failed.
 */
export const CONCURRENT_ROTATION_MAX_RETRIES = 5;

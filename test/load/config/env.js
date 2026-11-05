/**
 * Environment configuration for k6 load and benchmark tests.
 *
 * Supports running against:
 * - Local server: http://localhost:3000 (default)
 * - Dev / Staging Cloud Run: https://<service>-<hash>-<region>.a.run.app
 * - Production: Custom URL or domain
 *
 * Override via CLI environment variables:
 *   k6 run -e TARGET_ENV=dev ...
 *   k6 run -e BASE_URL=https://custom-url.com ...
 */

const ENVIRONMENTS = {
  local: 'http://localhost:3000',
  dev: 'https://breathaway-backend-dev.a.run.app',
  prod: 'https://api.breathaway.app',
};

/**
 * Resolves the active base URL for load test execution.
 *
 * Priority:
 * 1. Explicit BASE_URL environment variable (-e BASE_URL=...)
 * 2. Preconfigured TARGET_ENV preset (-e TARGET_ENV=local|dev|prod)
 * 3. Default fallback: http://localhost:3000
 *
 * @returns {string} Fully-qualified base URL without trailing slash
 */
export function getBaseUrl() {
  if (__ENV.BASE_URL && __ENV.BASE_URL.trim() !== '') {
    return __ENV.BASE_URL.replace(/\/+$/, '');
  }

  const target = (__ENV.TARGET_ENV || 'local').toLowerCase();
  const url = ENVIRONMENTS[target] || ENVIRONMENTS.local;
  return url.replace(/\/+$/, '');
}

/**
 * Returns default request timeout in milliseconds.
 */
export const DEFAULT_TIMEOUT_MS = __ENV.TIMEOUT_MS
  ? parseInt(__ENV.TIMEOUT_MS, 10)
  : 10000;

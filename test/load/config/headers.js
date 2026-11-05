/**
 * Standard HTTP headers builder for k6 load and benchmark tests.
 *
 * Implements the mandatory client identity headers required by NestJS
 * `ClientIdentityGuard` when invoking protected or non-skipped routes.
 */

/**
 * Returns baseline JSON request headers without client identity.
 * Ideal for public / health probes (/health, /ready).
 *
 * @param {Record<string, string>} [customHeaders={}]
 * @returns {Record<string, string>}
 */
export function getStandardHeaders(customHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders,
  };
}

/**
 * Returns headers with full mobile client identity attributes.
 * Conforms to ClientIdentityGuard requirements (API key, Client ID, User-Agent, etc.).
 *
 * Override defaults via CLI environment variables:
 *   k6 run -e API_KEY=my-key -e CLIENT_ID=my-client ...
 *
 * @param {Record<string, string>} [customHeaders={}]
 * @returns {Record<string, string>}
 */
export function getClientIdentityHeaders(customHeaders = {}) {
  const apiKey = __ENV.API_KEY || 'test-api-key';
  const clientId = __ENV.CLIENT_ID || 'test-client-id';
  const appName = __ENV.APP_NAME || 'BreathAway';
  const appVersion = __ENV.APP_VERSION || '1.0.0';
  const platform = __ENV.PLATFORM || 'iOS';
  const deviceId = __ENV.DEVICE_ID || 'k6-load-test-runner';
  const timezone = __ENV.TIMEZONE || 'UTC';

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': apiKey,
    'x-client-id': clientId,
    'x-device-id': deviceId,
    'x-user-agent': `${appName}/${appVersion} (${platform} 17.0; LoadTestRunner)`,
    'x-timezone': timezone,
    ...customHeaders,
  };

  // Optional JWT or Bearer token passed via CLI
  if (__ENV.AUTH_TOKEN) {
    headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN.trim()}`;
  }

  return headers;
}

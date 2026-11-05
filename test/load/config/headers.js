/**
 * Standard HTTP headers builder for k6 load and benchmark tests.
 *
 * Implements:
 * 1. Mandatory `x-request-id` header enforced by NestJS RequestIdMiddleware.
 * 2. Mobile client identity headers required by ClientIdentityGuard (API key, Client ID, User-Agent, timezone).
 */

/**
 * Generates an RFC4122 v4 compliant UUID string.
 *
 * @returns {string} Formatted UUID (e.g. "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")
 */
export function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns baseline JSON request headers.
 * Includes unique x-request-id required by RequestIdMiddleware.
 * Ideal for public / health probes (/health, /ready).
 *
 * @param {Record<string, string>} [customHeaders={}]
 * @returns {Record<string, string>}
 */
export function getStandardHeaders(customHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-request-id': generateUuid(),
    ...customHeaders,
  };
}

/**
 * Returns headers with full mobile client identity attributes and unique x-request-id.
 * Conforms to ClientIdentityGuard requirements.
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
    'x-request-id': generateUuid(),
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

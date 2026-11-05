import http from 'k6/http';
import { check, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getClientIdentityHeaders } from '../config/headers.js';
import { loadThresholds } from '../config/thresholds.js';

/**
 * Configurable API Endpoint Benchmark Runner
 *
 * Allows benchmarking any API endpoint with client-identity headers and auth.
 *
 * CLI Parameters:
 *   -e ENDPOINT=/api/v1/users/profile
 *   -e METHOD=GET (default) | POST | PUT | PATCH
 *   -e PAYLOAD='{"key":"value"}'
 *   -e AUTH_TOKEN=jwt_token_here
 *   -e VUS=30
 *   -e DURATION=1m
 */
const endpoint = __ENV.ENDPOINT || '/health';
const method = (__ENV.METHOD || 'GET').toUpperCase();
const payload = __ENV.PAYLOAD || null;
const vus = __ENV.VUS ? parseInt(__ENV.VUS, 10) : 25;
const duration = __ENV.DURATION || '30s';

export const options = {
  vus,
  duration,
  thresholds: loadThresholds,
};

export default function () {
  const url = `${getBaseUrl()}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const params = {
    headers: getClientIdentityHeaders(),
    tags: { name: `API_${method}_${endpoint}` },
  };

  let res;
  if (method === 'POST') {
    res = http.post(url, payload || '{}', params);
  } else if (method === 'PUT') {
    res = http.put(url, payload || '{}', params);
  } else if (method === 'PATCH') {
    res = http.patch(url, payload || '{}', params);
  } else if (method === 'DELETE') {
    res = http.del(url, payload, params);
  } else {
    res = http.get(url, params);
  }

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'latency is acceptable': (r) => r.timings.duration < 500,
  });

  sleep(0.5);
}

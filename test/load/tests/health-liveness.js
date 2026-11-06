import http from 'k6/http';
import { check, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getStandardHeaders } from '../config/headers.js';
import { loadThresholds } from '../config/thresholds.js';

/**
 * Health Liveness Benchmark (/health)
 *
 * Validates:
 * 1. Node.js event-loop latency and Terminus memory indicator checks under load.
 * 2. Web framework (NestJS / Express) routing overhead without downstream database IO.
 * 3. Base throughput limits of a single container instance.
 */
export const options = {
  stages: [
    { duration: '15s', target: 20 }, // Ramp up to 20 VUs
    { duration: '30s', target: 50 }, // Steady state at 50 VUs
    { duration: '15s', target: 100 }, // Peak at 100 VUs
    { duration: '15s', target: 0 }, // Ramp down
  ],
  thresholds: loadThresholds,
};

export default function () {
  const url = `${getBaseUrl()}/health`;
  const params = {
    headers: getStandardHeaders(),
    tags: { name: 'HealthLiveness' },
  };

  const res = http.get(url, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'status body is ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch {
        return false;
      }
    },
    'response time < 250ms': (r) => r.timings.duration < 250,
  });

  sleep(0.5); // 500ms pacing between requests per VU
}

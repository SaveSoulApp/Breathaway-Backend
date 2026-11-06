import http from 'k6/http';
import { check, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getStandardHeaders } from '../config/headers.js';
import { loadThresholds } from '../config/thresholds.js';

/**
 * Health Readiness & Database Pool Benchmark (/ready)
 *
 * Validates:
 * 1. Cloud SQL PostgreSQL connection pool handling under concurrent checkouts.
 * 2. Prisma ORM socket acquisition latency and query event responsiveness.
 * 3. Redis ping latency and connection stability under load.
 */
export const options = {
  stages: [
    { duration: '15s', target: 15 }, // Ramp up to 15 concurrent users
    { duration: '30s', target: 35 }, // Steady state matching standard pool limit
    { duration: '20s', target: 60 }, // Push beyond single-pool default to test checkout queuing
    { duration: '15s', target: 0 }, // Clean ramp down
  ],
  thresholds: {
    ...loadThresholds,
    // Database and Redis readiness checks usually have slightly more latency allowance
    http_req_duration: ['p(95)<400', 'p(99)<800'],
  },
};

export default function () {
  const url = `${getBaseUrl()}/ready`;
  const params = {
    headers: getStandardHeaders(),
    tags: { name: 'HealthReadiness' },
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
    'database is up': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          body.info && body.info.database && body.info.database.status === 'up'
        );
      } catch {
        return false;
      }
    },
    'redis is up': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.info && body.info.redis && body.info.redis.status === 'up';
      } catch {
        return false;
      }
    },
    'response time < 400ms': (r) => r.timings.duration < 400,
  });

  sleep(0.5);
}

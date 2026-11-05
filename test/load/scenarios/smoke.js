import http from 'k6/http';
import { check, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getStandardHeaders } from '../config/headers.js';
import { smokeThresholds } from '../config/thresholds.js';

/**
 * Smoke Test Scenario
 *
 * Fast verification run (1-3 VUs for 15s) ensuring:
 * - The target server is reachable.
 * - Basic health assertions pass.
 * - Ideal for pre-commit, pull request checks, and quick sanity before heavy testing.
 */
export const options = {
  vus: 2,
  duration: '15s',
  thresholds: smokeThresholds,
};

export default function () {
  const baseUrl = getBaseUrl();
  const headers = getStandardHeaders();

  // 1. Check Liveness
  const livenessRes = http.get(`${baseUrl}/health`, {
    headers,
    tags: { name: 'Smoke_Health' },
  });

  check(livenessRes, {
    'liveness status is 200': (r) => r.status === 200,
    'liveness latency < 200ms': (r) => r.timings.duration < 200,
  });

  // 2. Check Readiness
  const readinessRes = http.get(`${baseUrl}/ready`, {
    headers,
    tags: { name: 'Smoke_Ready' },
  });

  check(readinessRes, {
    'readiness status is 200': (r) => r.status === 200,
    'readiness latency < 350ms': (r) => r.timings.duration < 350,
  });

  sleep(1);
}

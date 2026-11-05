import http from 'k6/http';
import { check, group, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getStandardHeaders } from '../config/headers.js';
import { stressThresholds } from '../config/thresholds.js';

/**
 * Stress Test Scenario
 *
 * Pushes system concurrency progressively beyond standard capacity:
 * 50 -> 100 -> 200 VUs.
 *
 * Primary objectives:
 * 1. Identify breaking point / bottleneck (Node.js CPU, memory, or DB connection pool).
 * 2. Observe how latency degrades when the Prisma connection pool is fully saturated.
 * 3. Verify that the system recovers cleanly after load drops.
 */
export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Step 1: Normal load
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 }, // Step 2: High load
    { duration: '1m', target: 100 },
    { duration: '30s', target: 200 }, // Step 3: Extreme stress
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 }, // Recovery ramp down
  ],
  thresholds: stressThresholds,
};

export default function () {
  const baseUrl = getBaseUrl();
  const headers = getStandardHeaders();

  group('Stress Health Checks', () => {
    const res = http.get(`${baseUrl}/ready`, {
      headers,
      tags: { name: 'Stress_Ready' },
    });

    check(res, {
      'status is 200': (r) => r.status === 200,
      'latency < 1000ms': (r) => r.timings.duration < 1000,
    });
  });

  sleep(0.5);
}

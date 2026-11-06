import http from 'k6/http';
import { check, group, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import {
  getClientIdentityHeaders,
  getStandardHeaders,
} from '../config/headers.js';
import { loadThresholds } from '../config/thresholds.js';

/**
 * Standard Production Load Test Scenario
 *
 * Simulates expected daily peak load with a smooth ramp-up, steady state, and ramp-down.
 * Exercises both lightweight health probes and identity-checked endpoints.
 */
const peakVus = parseInt(
  __ENV.LOAD_TEST_USERS || __ENV.USERS || __ENV.VUS || '50',
  10,
);
const warmupVus = Math.max(5, Math.floor(peakVus * 0.4));

export const options = {
  stages: [
    { duration: '30s', target: warmupVus }, // Ramp-up to initial load
    { duration: '1m', target: peakVus }, // Climb to target concurrent users
    { duration: '1m', target: peakVus }, // Maintain steady state
    { duration: '30s', target: 0 }, // Graceful ramp-down
  ],
  thresholds: loadThresholds,
};

export default function () {
  const baseUrl = getBaseUrl();

  group('Health & Readiness', () => {
    const healthRes = http.get(`${baseUrl}/health`, {
      headers: getStandardHeaders(),
      tags: { name: 'Load_Health' },
    });
    check(healthRes, {
      'health returns 200': (r) => r.status === 200,
    });

    const readyRes = http.get(`${baseUrl}/ready`, {
      headers: getStandardHeaders(),
      tags: { name: 'Load_Ready' },
    });
    check(readyRes, {
      'ready returns 200': (r) => r.status === 200,
    });
  });

  // Simulated authenticated or client-identified journey if configured
  if (__ENV.AUTH_TOKEN) {
    group('Authenticated User Flow', () => {
      const profileRes = http.get(`${baseUrl}/api/v1/users/profile`, {
        headers: getClientIdentityHeaders(),
        tags: { name: 'Load_UserProfile' },
      });
      check(profileRes, {
        'profile returns 200': (r) => r.status === 200,
      });
    });
  }

  sleep(1); // Standard user think time
}

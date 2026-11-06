import http from 'k6/http';
import { check, sleep } from 'k6';

import { getBaseUrl } from '../config/env.js';
import { getStandardHeaders } from '../config/headers.js';
import { spikeThresholds } from '../config/thresholds.js';

/**
 * Traffic Spike Scenario
 *
 * Simulates immediate, sharp traffic spikes (e.g. mass push notification or marketing drop):
 * 0 -> 150 VUs in 10 seconds.
 *
 * Objectives:
 * 1. Measure GCP Cloud Run cold start latency and autoscaling responsiveness.
 * 2. Verify connection pool acquisition queues don't exhaust socket pools.
 * 3. Validate that throttling / rate limiting shields internal components.
 */
export const options = {
  stages: [
    { duration: '10s', target: 5 }, // Low baseline traffic
    { duration: '10s', target: 150 }, // Massive sudden surge
    { duration: '30s', target: 150 }, // Hold spike
    { duration: '10s', target: 10 }, // Quick drop
    { duration: '20s', target: 0 }, // Recovery observation
  ],
  thresholds: spikeThresholds,
};

export default function () {
  const baseUrl = getBaseUrl();
  const res = http.get(`${baseUrl}/ready`, {
    headers: getStandardHeaders(),
    tags: { name: 'Spike_Ready' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency is acceptable during spike': (r) => r.timings.duration < 1500,
  });

  sleep(0.3);
}

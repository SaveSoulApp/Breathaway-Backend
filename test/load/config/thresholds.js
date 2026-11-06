/**
 * Service Level Objectives (SLOs) and pass/fail thresholds for k6 runs.
 *
 * Thresholds evaluate latency (p95, p99, median) and error rates.
 * If any threshold is breached, k6 exits with a non-zero exit code (CI failure).
 */

/**
 * Smoke Test Thresholds:
 * Strict latency targets with 0% error tolerance for quick sanity checks.
 */
export const smokeThresholds = {
  http_req_duration: ['p(95)<300', 'p(99)<500'],
  http_req_failed: ['rate<0.01'], // Less than 1% failure
};

/**
 * Normal Load Test Thresholds:
 * Represents realistic production performance SLA under anticipated steady traffic.
 */
export const loadThresholds = {
  http_req_duration: ['p(95)<350', 'p(99)<700'],
  http_req_failed: ['rate<0.02'], // Less than 2% failure
};

/**
 * Stress Test Thresholds:
 * Pushing system capacity to benchmark saturation limits.
 * Allows relaxed latency while ensuring the service does not completely fail.
 */
export const stressThresholds = {
  http_req_duration: ['p(95)<1000', 'p(99)<2500'],
  http_req_failed: ['rate<0.05'], // Less than 5% failure under peak saturation
};

/**
 * Spike Test Thresholds:
 * Tests rapid traffic bursts and Cloud Run autoscaling cold starts.
 */
export const spikeThresholds = {
  http_req_duration: ['p(95)<1500', 'p(99)<3000'],
  http_req_failed: ['rate<0.05'],
};

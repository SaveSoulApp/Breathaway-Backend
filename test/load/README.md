# Grafana k6 Load & Benchmark Testing Suite

This directory contains the automated performance, load, stress, and spike testing suites for the BreathAway NestJS backend, built with **Grafana k6**.

---

## 1. Prerequisites

Ensure `k6` is installed on your machine:

```bash
# macOS (via Homebrew)
brew install k6

# Verify installation
k6 version
```

---

## 2. Quick Start Scripts

Run from the repository root:

| Command                        | Purpose                                                                                                         | Profile                     |
| :----------------------------- | :-------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| `pnpm run test:load:pipeline`  | **All-in-One Automated Pipeline:** Setup accounts $\rightarrow$ Run user flows $\rightarrow$ Guaranteed cleanup | Automated 3-Stage Lifecycle |
| `pnpm run test:load:setup`     | Pre-seeds test accounts (+912222...) and mints 15-min JWT tokens                                                | Writes `.test-session.json` |
| `pnpm run test:load:user-flow` | Runs stateful user journeys (profile, feed, likes, matches) using pre-seeded pool                               | 5 → 20 VUs                  |
| `pnpm run test:load:cleanup`   | Wipes test users & all child records (likes, matches, chats, sessions) in FK order                              | Restores DB to clean state  |
| `pnpm run test:load:smoke`     | Fast sanity check before running full suites                                                                    | 2 VUs for 15s               |
| `pnpm run test:load:health`    | Measures baseline Node.js event-loop throughput (`/health`)                                                     | Ramp up to 100 VUs          |
| `pnpm run test:load:ready`     | Benchmarks Prisma ORM + PostgreSQL connection pool & Redis (`/ready`)                                           | 15 → 35 → 60 VUs            |
| `pnpm run test:load`           | Simulates standard production daily peak traffic                                                                | 20 → 50 VUs sustained       |
| `pnpm run test:load:stress`    | Pushes system beyond capacity to identify bottlenecks                                                           | 50 → 100 → 200 VUs          |
| `pnpm run test:load:spike`     | Sudden traffic surge to test Cloud Run autoscaling & cold starts                                                | 0 → 150 VUs in 10s          |

---

## 3. Safe Database Testing & Phone Number Strategy

To prevent database bloat, dirtying QA accounts, or triggering unintended WhatsApp messages:

1. **Deterministic Non-Routable Phone Numbers:**
   - Test numbers always use India country code `+91` with prefix `2222` (e.g. `+912222000001` through `+912222000020`).
   - Because mobile numbers in India start with 6, 7, 8, or 9, `+912222...` numbers are non-routable for mobile SMS / WhatsApp delivery.
2. **Explicit WhatsApp Suppression:**
   - In `user-flow.js`, all like creation calls pass `"notifyRecipientAnonymously": false`.
3. **Fixed Pre-Seeded Pool:**
   - VUs do not register new accounts during tests. They cycle through the bounded test pool.
4. **Guaranteed Cascade Teardown:**
   - `pnpm run test:load:cleanup` purges in strict FK order:
     `PaymentOrder` $\rightarrow$ `Notification` $\rightarrow$ `Transaction` $\rightarrow$ `UserSubscription` $\rightarrow$ `Message` $\rightarrow$ `ChatRoom` $\rightarrow$ `Match` $\rightarrow$ `Block` $\rightarrow$ `Like` $\rightarrow$ `CreditLedger` $\rightarrow$ `Device` $\rightarrow$ `UserSession` $\rightarrow$ `UserProfile` $\rightarrow$ `Identity` $\rightarrow$ `User`.

---

## 4. Targeting Environments

By default, tests target `http://localhost:3000`. You can point tests to any environment using CLI environment variables:

### A. Run against Local Server

```bash
# Terminal 1: Start your NestJS app
pnpm run start:dev

# Terminal 2: Run automated pipeline
pnpm run test:load:pipeline
```

### B. Run against Cloud Run (Dev / Staging)

```bash
# Option 1: Run complete automated pipeline against Cloud Run
pnpm run test:load:setup
k6 run -e BASE_URL=https://<your-cloud-run-service-url>.a.run.app test/load/scenarios/user-flow.js
pnpm run test:load:cleanup

# Option 2: Run stateless health benchmark against Cloud Run
k6 run -e BASE_URL=https://<your-cloud-run-service-url>.a.run.app test/load/scenarios/load.js
```

---

## 5. Interpreting k6 Benchmark Results

```text
✓ profile returns 200
✓ matches returns 200
✓ likes returns 200
✓ create like returns 201 or 409

checks.........................: 100.00% ✓ 1200      ✗ 0
http_req_duration..............: avg=32.12ms min=4.2ms med=24.6ms max=182.1ms p(90)=48.2ms p(95)=64.1ms p(99)=112.4ms
http_req_failed................: 0.00%   ✓ 0         ✗ 600
http_reqs......................: 600     50.12/s
vus............................: 20      min=5       max=20
```

### Key Metrics

- **`p(95)` / `p(99)`:** 95th and 99th percentile latencies across your journey endpoints.
- **`http_req_failed`:** Failure rate (should stay `< 1%`).
- **Prisma Logs:** Observe server logs for `slow_query_detected` or `pool_contention_detected`.

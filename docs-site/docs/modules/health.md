---
sidebar_position: 9
---

# Health Module

The `HealthModule` uses NestJS `@nestjs/terminus` to verify the operational state of the backend service and its dependencies.

---

## 📋 Purpose & Responsibilities

- **System Diagnostics**: Evaluates the status of the database connection (Prisma), local memory usage, and Redis cache.
- **Uptime Monitoring**: Exposes a public endpoint used by Google Cloud Run load balancers for deployment checks and health status.

---

## 🧠 Business Logic & Core Concepts

### 1. Terminus Indicators (Liveness & Readiness Probes)
The endpoint orchestrates four concurrent health checks using `@nestjs/terminus`:
- **Database**: Pings PostgreSQL via `PrismaHealthIndicator`.
- **Cache**: Pings Redis via a custom `RedisHealthIndicator`.
- **Memory (Heap)**: Ensures Node.js V8 heap usage is under 150MB.
- **Memory (RSS)**: Ensures total Resident Set Size is under 150MB.

### 2. Cloud Run Readiness
If any of these four checks fail or timeout, the controller returns a `503 Service Unavailable`. Cloud Run and GCP Load Balancers use this signal to instantly stop routing traffic to the unhealthy container instance, preventing degraded user experiences.

---

## 🛠 File & Class Definitions

### Controller
- **[HealthController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/health/health.controller.ts)**: Exposes the `/api/v1/health` route.
  - `@SkipClientIdentity()` is applied here to bypass standard mobile headers checking.

---

## 🔄 Public APIs

- `GET /health`: Returns `{ status: 'ok', info: { ... } }` and responds with HTTP status `200` if all services are healthy, or `503 Service Unavailable` if a core check fails.

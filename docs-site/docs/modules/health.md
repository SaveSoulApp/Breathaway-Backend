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

## 🛠 File & Class Definitions

### Controller
- **[HealthController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/health/health.controller.ts)**: Exposes the `/api/v1/health` route.
  - `@SkipClientIdentity()` is applied here to bypass standard mobile headers checking.

---

## 🔄 Public APIs

- `GET /health`: Returns `{ status: 'ok', info: { ... } }` and responds with HTTP status `200` if all services are healthy, or `503 Service Unavailable` if a core check fails.

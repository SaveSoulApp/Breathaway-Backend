# GCP-Specific Requirements
- `/health` must return `200 { status: 'ok' }` — used by Cloud Run and GKE liveness probes.
- `/ready` must return `200 { status: 'ok', db: 'connected' }` — checks Prisma connectivity.
- All responses must be valid JSON (no plain-text error responses) for Cloud Logging compatibility.
- CORS must be explicitly configured for any service behind a GCP Load Balancer or API Gateway.

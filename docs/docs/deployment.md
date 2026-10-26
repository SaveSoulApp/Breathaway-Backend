---
sidebar_position: 5
---

# Deployment Guide

This guide details the deployment pipeline, containerization strategy, and infrastructure setup for the BreathAway NestJS backend.

---

## 🐳 Containerization (Docker)

The application is containerized using a multi-stage Docker build process located in the root `Dockerfile`.

### Docker Architecture

1. **Base Stage (`node:22-slim`)**:
   - Standardizes the Node runtime environment.
   - Installs `openssl` (required by Prisma's query engine).
   - Installs `pnpm` globally.
2. **Builder Stage**:
   - Copies dependency manifest files (`package.json`, `pnpm-lock.yaml`) and database schemas.
   - Runs `pnpm install --frozen-lockfile` to install all dependencies.
   - Generates Prisma client types.
   - Compiles TypeScript into JavaScript (`pnpm build`).
   - Runs `pnpm prune --prod` to strip away unnecessary developer packages, leaving only production engines.
3. **Runner Stage**:
   - Inherits the clean Node base image.
   - Switches execution context to a secure, non-root user (`node`).
   - Copies _only_ the compiled code and pruned `node_modules`.
   - Exposes port `8080` (standard for GCP Cloud Run).
   - Executes the compiled javascript bundle: `node dist/main.js`.

---

## 🏗 Single-Artifact, Dual-Service Deployment

To achieve **complete segregation of concerns and least-privilege security**, a single deployment builds **one container image artifact** and deploys it to **two distinct Cloud Run services**:

```mermaid
flowchart TD
    BUILD["Cloud Build (Single Docker Artifact)<br/>backend-service:<git-commit>"]

    BUILD -->|"Deploy (Public API)"| PUB["backend-service<br/>SA: backend-service<br/>Ingress: all (Unauthenticated)<br/>CPU: 2 | RAM: 2Gi | Conc: 160"]
    BUILD -->|"Deploy (Internal Worker)"| MAINT["maintenance-service<br/>SA: maintenance-runner<br/>Ingress: all (No-Unauth / IAM)<br/>CPU: 2 | RAM: 2Gi | Conc: 80"]

    CLIENTS["Mobile & Web Clients"] --> PUB
    SCHEDULER["Cloud Scheduler (scheduler-invoker)"] --> MAINT
```

### Why Deploy Across Two Services?

1. **IAM Privilege Segregation**:
   - **`backend-service`**: Driven by `backend-service@<project>.iam.gserviceaccount.com`. Retains strictly read-only access to Secret Manager (`roles/secretmanager.secretAccessor`). Even if the public API suffers an exploit, the attacker cannot add or mutate secrets.
   - **`maintenance-service`**: Driven by `maintenance-runner@<project>.iam.gserviceaccount.com`. Possesses elevated permissions to rotate secrets (`roles/secretmanager.secretVersionAdder` scoped to specific secrets like `access-token-instagram`).
2. **Resource & Scaling Segregation**:
   - **`backend-service`**: Scaled for high concurrency web traffic (`CONCURRENCY=160`, `MAX_INSTANCES=20`).
   - **`maintenance-service`**: Configured with dedicated memory and lower concurrency (`CONCURRENCY=80`, `MAX_INSTANCES=5`), ensuring that intensive batch sweeps and memory-heavy cron loops never degrade user-facing API performance or trigger out-of-memory container crashes on public traffic.
3. **Perimeter Authentication**:
   - `backend-service` allows unauthenticated traffic (`--allow-unauthenticated`) for public mobile clients.
   - `maintenance-service` disallows unauthenticated traffic (`--no-allow-unauthenticated`). Only caller identities with `roles/run.invoker` (Cloud Scheduler's `scheduler-invoker` service account) can reach the container.

---

## 🚢 Deployment Orchestration

Releases to Google Cloud are managed by the unified deployment script [`scripts/deploy/deploy.sh`](file:///scripts/deploy/deploy.sh), triggered via root `pnpm` commands:

```bash
# Full deployment to Staging / Dev environment (both services)
pnpm run deploy:dev

# Full deployment to Production environment (both services)
pnpm run deploy:prod
```

### Advanced CLI Deployment Flags

[`scripts/deploy/deploy.sh`](file:///scripts/deploy/deploy.sh) supports targeted deployments to minimize revision rollouts:

```bash
# Deploy only the public backend service:
./scripts/deploy/deploy.sh --env=dev --only-public

# Deploy only the internal maintenance worker:
./scripts/deploy/deploy.sh --env=dev --only-maintenance

# Skip deploying maintenance service when updating backend:
./scripts/deploy/deploy.sh --env=dev --no-maintenance

# Force image rebuild even if the Git commit tag already exists in Artifact Registry:
./scripts/deploy/deploy.sh --env=dev --force

# Skip resolving dynamic secret versions (fallback to unpinned :latest):
./scripts/deploy/deploy.sh --env=dev --no-pin-secrets
```

### 🔐 Dynamic Secret Version Pinning (INFRA-03)

During deployment, `scripts/deploy/deploy.sh` dynamically queries GCP Secret Manager and pins exact numeric versions to the new Cloud Run revision. This ensures 100% credential consistency across autoscaled instances and enables one-click rollbacks.

For comprehensive rotation protocols, dual-key migration recipes, and deprecation checklists, refer to the **[GCP Secret Rotation Runbook](./secret-rotation.md)**.

### Configuration & Sizing Parameterization

Deployment configurations follow a modular single-source-of-truth pattern:

- **Shared Defaults & Invariants**: Defined in [`scripts/deploy/common.base.sh`](file:///scripts/deploy/common.base.sh) (e.g. CPU, memory, database pool timeouts, pub/sub topics, default country code).
- **Environment Overrides**: Specified in [`scripts/deploy/common.dev.sh`](file:///scripts/deploy/common.dev.sh) and [`scripts/deploy/common.prod.sh`](file:///scripts/deploy/common.prod.sh) (e.g. `PROJECT_ID`, `NODE_ENV`, `CORS_ORIGINS`, `JWT_ISSUER`, `MAX_INSTANCES`, `SWAGGER_ENABLED`), which source `common.base.sh`.

```bash
# Shared Base (scripts/deploy/common.base.sh)
export CPU='2'
export MEMORY='2Gi'
export CONCURRENCY='160'
export MAINTENANCE_CPU='2'
export MAINTENANCE_MEMORY='2Gi'
export MAINTENANCE_MAX_INSTANCES='5'
export MAINTENANCE_CONCURRENCY='80'

# Environment-Specific Scaling (common.dev.sh vs common.prod.sh)
export MAX_INSTANCES='10'  # 10 for dev, 20 for prod
```

---

## 🏗 GCP Infrastructure & Terraform

Infrastructure resources are managed declaratively using **Terraform** inside the `/terraform` directory:

- **[`terraform/backend-iam.tf`](file:///terraform/backend-iam.tf)**: Defines `backend-service` service account and its read-only secret accessor, Cloud SQL, KMS, and Pub/Sub roles.
- **[`terraform/scheduler.tf`](file:///terraform/scheduler.tf)**:
  - Declares `scheduler-invoker` service account and binds `roles/run.invoker` to `maintenance-service`.
  - Declares `maintenance-runner` service account and binds `roles/secretmanager.secretVersionAdder` for `access-token-instagram`.
  - Defines all automated Cloud Scheduler jobs targeting `maintenance-service` with Google OIDC authentication.
- **[`terraform/pubsub.tf`](file:///terraform/pubsub.tf)**: Configures event push subscriptions back to Cloud Run.
- **[`terraform/audit-logs.tf`](file:///terraform/audit-logs.tf)**: Integrates Cloud Logging sinks to stream structured security and audit logs to BigQuery.

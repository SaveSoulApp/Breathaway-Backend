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

## 🏗 GCP Infrastructure & Terraform

Infrastructure is declared declaratively using **Terraform** inside the `/terraform` directory.

Key modules managed by Terraform:

- **Cloud Run**: Runs stateless, containerized instances of the NestJS application.
- **Cloud Scheduler (`scheduler.tf`)**: Automates cron execution of endpoints. For example, triggers the match resolution background loop or credit expiration checks by making authenticated HTTP requests to the Cloud Run API.
- **Audit Logs (`audit-logs.tf`)**: Integrates Cloud Logging sinks to monitor security events.

---

## 🚢 Deployment Orchestration

We release updates to Google Cloud using custom bash scripts triggered via root `pnpm` commands.

### Deploy Command Reference

Before executing, ensure you have authenticated with the Google Cloud CLI (`gcloud auth login`) and set up appropriate service account credentials.

```bash
# Deploy to Staging / Dev environment
pnpm run deploy:dev

# Deploy to Production environment
pnpm run deploy:prod
```

These commands invoke the `./scripts/deploy.sh` script, which automates:

1. Docker image compilation and tag creation.
2. Pushing the image to **GCP Artifact Registry**.
3. Deploying the new container tag to **GCP Cloud Run**.
4. Linking Secret Manager credentials.
5. Executing database migration deploy hooks.

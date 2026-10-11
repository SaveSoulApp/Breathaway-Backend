---
sidebar_position: 7
---

# Troubleshooting

This page outlines common issues encountered during development and deployment of the BreathAway API and how to resolve them.

---

## 🗄 1. Database Connection Failures

### Symptom: `PrismaClientInitializationError` or `Connection Refused`

**Cause**: The NestJS application cannot reach the PostgreSQL database.
**Solutions**:

1. Check if your database container is running:
   ```bash
   docker ps
   ```
   If no PostgreSQL container is listed, start it:
   ```bash
   docker-compose up -d
   ```
2. Verify that your `.env` contains the correct `DATABASE_URL`. It should match:
   ```env
   DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<dbname>?schema=public"
   ```
3. If running tests, verify that `.env.test` has been synchronized.

---

## 🔑 2. Identity Encryption / KMS Failures

### Symptom: `decryption failed` or `PermissionDenied` when loading profile identities

**Cause**: The application cannot decrypt the encrypted database fields because it lacks credentials for the Google Cloud KMS key.
**Solutions**:

1. Ensure you are authenticated with GCP on your command line:
   ```bash
   gcloud auth application-default login
   ```
2. Check that your local environment variables in `.env` match the correct GCP Key Ring and Key configurations:
   ```env
   GCP_KMS_KEY_NAME="projects/<project-id>/locations/global/keyRings/<ring>/cryptoKeys/<key>"
   ```
3. If developing offline, configure the KMS mock mode in the `.env` configuration (if your team supports a fallback mock decryption mode).

---

## 🚨 3. Throttler Limits Exceeded (429 Errors)

### Symptom: `429 Too Many Requests`

**Cause**: You have hit the NestJS rate limiter (`ThrottlerGuard`) during testing.
**Solutions**:

1. In `app.module.ts`, rates are defined under:
   - `short`: 5 requests per second
   - `medium`: 20 requests per 10 seconds
   - `long`: 50 requests per 60 seconds
2. If running automated tests (e.g. scripts/load tests), ensure you are either mocking the rate limiter or adjusting rate limit config variables.

---

## 📖 4. Swagger UI Returns 404

### Symptom: Cannot open `/api/public` or `/api/admin`

**Cause**: Swagger is disabled.
**Solutions**:

1. Open your `.env` file and make sure the flag is enabled:
   ```env
   SWAGGER_ENABLED=true
   ```
2. Restart your development server:
   ```bash
   pnpm run start:dev
   ```

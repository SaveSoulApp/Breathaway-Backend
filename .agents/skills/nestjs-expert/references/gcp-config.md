# GCP & Config Reference

## Environment Variables

All env access goes through `ConfigService`. Never use `process.env` directly — it bypasses type safety and makes testing harder.

```typescript
// ✅ Correct
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentsService {
  private readonly stripeKey: string;

  constructor(private readonly config: ConfigService) {
    // Fail fast at startup if a required variable is missing
    this.stripeKey = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
  }
}

// ❌ Wrong — never do this
const key = process.env.STRIPE_SECRET_KEY;
```

Use `getOrThrow` for required variables. Use `get` with a default for optional ones:

```typescript
const port = this.config.get<number>('PORT', 3000);
const isDev = this.config.get<string>('NODE_ENV') === 'development';
```

## Adding a New Variable

Never touch `.env` files. When a new variable is needed:

1. Output the key name and a description to the user:
   ```
   Add this to your .env.local (for local dev) and env.dev.yaml (for GCP):
   MY_NEW_KEY=<value>
   ```
2. Update `src/config/configuration.ts` (or equivalent) to include the key in the validated config schema if the project uses `@hapi/joi` or `zod` validation.
3. Use `ConfigService.getOrThrow('MY_NEW_KEY')` in the service.

## Cloud Run Statelessness Rules

Cloud Run instances can be spun up, killed, and replaced at any time. This means:

**Never store state in module-level variables or singleton caches** that assume the instance lives forever:

```typescript
// ❌ This cache dies when the instance is replaced
const userCache = new Map<string, User>();

// ✅ Use Redis via a shared cache module, or re-fetch from Prisma
```

**Never write files to the local filesystem** and expect them to persist. Use Cloud Storage for files:

```typescript
// ❌
fs.writeFileSync('/tmp/upload.csv', data);

// ✅ Stream to GCS via @google-cloud/storage
```

**Avoid long-running in-process jobs.** Background work should go to Cloud Tasks or Pub/Sub, not `setInterval` or `setTimeout` loops in a NestJS service.

## Secret Manager (Production Secrets)

Sensitive production secrets (API keys, DB passwords) live in GCP Secret Manager, not env vars. They're injected at Cloud Run deploy time as env vars — so from NestJS's perspective, they're still accessed via `ConfigService`. You don't need the Secret Manager SDK in application code.

If you need to add a new secret:

```
Tell the user:
1. Create the secret in GCP Secret Manager:
   gcloud secrets create MY_SECRET --data-file=- <<< "secret-value"

2. Grant the Cloud Run service account access:
   gcloud secrets add-iam-policy-binding MY_SECRET \
     --member="serviceAccount:<SA_EMAIL>" \
     --role="roles/secretmanager.secretAccessor"

3. Mount it as an env var in the Cloud Run service configuration.
```

## ConfigModule Setup (for reference)

If setting up `ConfigModule` from scratch:

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // no need to import ConfigModule in every module
      cache: true, // cache reads for performance
      envFilePath: '.env.local',
    }),
  ],
})
export class AppModule {}
```

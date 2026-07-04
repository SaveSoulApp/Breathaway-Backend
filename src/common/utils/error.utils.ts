import axios from 'axios';
import { Prisma } from '@prisma/client';

/**
 * Serializes any thrown value into a consistent, log-safe shape.
 *
 * Using this helper ensures all `logger.error(...)` calls across every service
 * emit the same structured field shape in GCP Cloud Logging, making log-based
 * alerts and cross-service error queries field-consistent.
 *
 * **Error type priority order:**
 * 1. `AxiosError` — HTTP client errors from external API calls (Instagram, Mailgun, Brevo).
 *    Only safe fields are captured; `config` is intentionally stripped because it contains
 *    `Authorization` headers and request body that may hold API keys or user PII.
 * 2. `PrismaClientKnownRequestError` — DB constraint errors. Captures `code` (e.g. "P2002"),
 *    `meta` (e.g. `{ target: ["email"] }` — which field violated the constraint), and
 *    `clientVersion` for schema drift diagnosis.
 * 3. Generic `Error` — captures `message`, `name`, `stack`, and any `code` property
 *    (covers Node.js `ErrnoException`: `ECONNREFUSED`, `ETIMEDOUT`, etc.).
 * 4. Plain objects — passed through as-is (e.g. thrown `{ code, message }` shapes).
 * 5. Primitives — stringified into `{ message }`.
 *
 * @param err - The thrown value. May be an Error subclass, a plain object, or a primitive.
 * @returns A plain object safe to pass as structured log metadata.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  // 1. Axios HTTP client errors — strip config to prevent credential/PII leakage
  if (axios.isAxiosError(err)) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      // Network-level error code (e.g. ECONNREFUSED, ETIMEDOUT, ERR_NETWORK)
      code: err.code,
      // Upstream HTTP response — already sanitized by the external API
      httpStatus: err.response?.status,
      httpData: err.response?.data,
      // config is intentionally omitted — it contains Authorization headers,
      // API keys, and request body which may hold credentials or user PII.
    };
  }

  if (err instanceof Error) {
    // 2. Prisma known request errors carry structured metadata beyond a plain stack trace.
    // `meta` is the most actionable field — for P2002 it contains { target: ['fieldName'] },
    // identifying exactly which unique constraint was violated.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        message: err.message,
        name: err.name,
        stack: err.stack,
        code: err.code,
        meta: err.meta,
        clientVersion: err.clientVersion,
      };
    }

    // 3. Generic Error — covers Node.js ErrnoException (ECONNREFUSED, ETIMEDOUT, etc.)
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      ...('code' in err && err.code !== undefined
        ? { code: (err as NodeJS.ErrnoException).code }
        : {}),
    };
  }

  // 4. Plain objects (e.g. thrown { code, message } shapes from legacy SDK wrappers)
  if (typeof err === 'object' && err !== null) {
    return err as Record<string, unknown>;
  }

  // 5. Primitives
  return { message: String(err) };
}

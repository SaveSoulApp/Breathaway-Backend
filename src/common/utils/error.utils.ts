import { Prisma } from '@prisma/client';

/**
 * Serializes any thrown value into a consistent, log-safe shape.
 *
 * Using this helper ensures all `logger.error(...)` calls across every service
 * emit the same `{ message, name, stack, code }` structure in GCP Cloud Logging,
 * making log-based alerts and cross-service error queries field-consistent.
 *
 * Prisma errors receive special treatment: `PrismaClientKnownRequestError` carries
 * structured metadata (`code`, `meta`, `clientVersion`) that is critical for diagnosing
 * constraint violations (e.g., which unique field triggered `P2002`). Without this branch,
 * `meta` is silently dropped and the log entry becomes far less actionable.
 *
 * @param err - The thrown value. May be an Error instance, a plain object, or a primitive.
 * @returns A plain object safe to pass as structured log metadata.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    // Prisma known request errors carry structured metadata beyond a plain stack trace.
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

    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      // Capture OS/HTTP/gRPC codes when present (e.g. Axios, Node fs errors)
      ...('code' in err && err.code !== undefined
        ? { code: (err as NodeJS.ErrnoException).code }
        : {}),
    };
  }

  if (typeof err === 'object' && err !== null) {
    return err as Record<string, unknown>;
  }

  return { message: String(err) };
}

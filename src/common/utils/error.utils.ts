/**
 * Serializes any thrown value into a consistent, log-safe shape.
 *
 * Using this helper ensures all `logger.error(...)` calls across every service
 * emit the same `{ message, name, stack, code }` structure in GCP Cloud Logging,
 * making log-based alerts and cross-service error queries field-consistent.
 *
 * @param err - The thrown value. May be an Error instance, a plain object, or a primitive.
 * @returns A plain object safe to pass as structured log metadata.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      // Capture HTTP status or gRPC codes when present (e.g. Prisma, Axios errors)
      ...(('code' in err && err.code !== undefined) ? { code: (err as NodeJS.ErrnoException).code } : {}),
    };
  }

  if (typeof err === 'object' && err !== null) {
    return err as Record<string, unknown>;
  }

  return { message: String(err) };
}

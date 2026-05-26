/**
 * Canonical path constants for all Swagger UI endpoints.
 *
 * These are the single source of truth shared between:
 * - `swagger.config.ts`      → registers Swagger docs at these paths
 * - `swagger-basic-auth.config.ts` → guards these exact paths with Basic Auth
 *
 * A mismatch between registration and protection would silently expose the
 * API docs publicly, so both files MUST reference these constants.
 */
export const SWAGGER_PUBLIC_PATH = 'api/public' as const;
export const SWAGGER_ADMIN_PATH = 'api/admin' as const;
export const REDOC_SUBPATH = 'redoc' as const;

export const SWAGGER_PROTECTED_PATHS = [
  SWAGGER_PUBLIC_PATH,
  SWAGGER_ADMIN_PATH,
] as const;

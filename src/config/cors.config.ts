import { INestApplication } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService, registerAs } from '@nestjs/config';

export const CORS_CONFIG_KEY = 'cors';

export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
];

export const DEFAULT_CORS_METHODS = [
  'GET',
  'HEAD',
  'PUT',
  'PATCH',
  'POST',
  'DELETE',
  'OPTIONS',
];

export const DEFAULT_CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'x-api-key',
  'x-client-id',
  'x-device-id',
  'x-user-agent',
  'x-request-id',
  'x-timezone',
  'x-cloud-trace-context',
];

/**
 * Encapsulates strongly-typed CORS configuration, validation, and parsing logic for incoming HTTP requests.
 */
export class CorsConfig {
  readonly allowedOrigins: string[];
  readonly methods: string[];
  readonly allowedHeaders: string[];
  readonly credentials: boolean;
  readonly optionsSuccessStatus: number;

  constructor(options?: {
    allowedOrigins?: string[];
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    optionsSuccessStatus?: number;
  }) {
    this.allowedOrigins =
      options?.allowedOrigins && options.allowedOrigins.length > 0
        ? options.allowedOrigins
        : DEFAULT_CORS_ORIGINS;
    this.methods = options?.methods ?? DEFAULT_CORS_METHODS;
    this.allowedHeaders =
      options?.allowedHeaders ?? DEFAULT_CORS_ALLOWED_HEADERS;
    this.credentials = options?.credentials ?? true;
    this.optionsSuccessStatus = options?.optionsSuccessStatus ?? 204;
  }

  /**
   * Safely parses CORS origins from an environment variable string.
   * Supports JSON arrays (e.g. '["http://localhost:3000"]') or comma-separated lists (e.g. 'http://localhost:3000,http://localhost:5173').
   * Trims whitespace, filters empty values, and falls back to default localhost origins when empty.
   */
  static parseOrigins(rawCorsOrigins?: string | null): string[] {
    if (!rawCorsOrigins || typeof rawCorsOrigins !== 'string') {
      return DEFAULT_CORS_ORIGINS;
    }

    let origins: string[] = [];
    try {
      const parsed = JSON.parse(rawCorsOrigins) as unknown;
      if (Array.isArray(parsed)) {
        origins = parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      origins = rawCorsOrigins
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
  }

  /**
   * Factory method to construct a CorsConfig instance from raw environment variables.
   */
  static fromEnv(rawCorsOrigins?: string | null): CorsConfig {
    return new CorsConfig({
      allowedOrigins: CorsConfig.parseOrigins(rawCorsOrigins),
    });
  }

  /**
   * Converts the configuration instance into NestJS/Express CorsOptions.
   * If a wildcard '*' is present in allowedOrigins, origin is mapped to true to reflect request origin with credentials.
   */
  toCorsOptions(): CorsOptions {
    return {
      origin: this.allowedOrigins.includes('*') ? true : this.allowedOrigins,
      methods: this.methods,
      allowedHeaders: this.allowedHeaders,
      credentials: this.credentials,
      optionsSuccessStatus: this.optionsSuccessStatus,
    };
  }
}

/**
 * Configuration factory registered with NestJS ConfigModule under the 'cors' namespace.
 */
export const corsConfig = registerAs(
  CORS_CONFIG_KEY,
  (): CorsConfig => CorsConfig.fromEnv(process.env.CORS_ORIGINS),
);

/**
 * Configures Cross-Origin Resource Sharing (CORS) for incoming browser requests.
 * Resolves the configuration via ConfigService ('cors' namespace) with fallback to raw CORS_ORIGINS.
 *
 * @param app - NestJS application instance
 * @param configService - ConfigService used to retrieve CORS configuration
 */
export function configureCors(
  app: INestApplication,
  configService: ConfigService,
): void {
  const cors =
    configService.get<CorsConfig>(CORS_CONFIG_KEY) ??
    CorsConfig.fromEnv(configService.get<string>('CORS_ORIGINS'));

  app.enableCors(cors.toCorsOptions());
}

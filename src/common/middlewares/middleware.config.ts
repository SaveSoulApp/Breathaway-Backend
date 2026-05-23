import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { SWAGGER_PROTECTED_PATHS } from 'src/config/swagger.constants';
import { RequestIdMiddleware } from './request-id.middleware';
import { TimezoneMiddleware } from './timezone.middleware';

/**
 * Centralises all middleware consumer configuration for the application.
 * Called from `AppModule.configure()` to keep the module class lean.
 *
 * Exclusion rationale:
 * - PubSub routes: Google Cloud Pub/Sub push subscriptions do not send app headers.
 * - Swagger routes: Browsers loading Swagger UI never send `X-Request-ID`.
 *   Each Swagger doc registers four addressable paths:
 *     1. /api/public          → Swagger UI HTML page
 *     2. /api/public/(.*)     → static assets under the path prefix
 *     3. /api/public-json     → OpenAPI JSON spec
 *     4. /api/public-yaml     → OpenAPI YAML spec
 */
export function configureMiddleware(consumer: MiddlewareConsumer): void {
  const pubSubExclusions = [
    { path: 'pubsub/(.*)', method: RequestMethod.ALL },
    { path: 'v1/pubsub/(.*)', method: RequestMethod.ALL },
    { path: 'api/v1/pubsub/(.*)', method: RequestMethod.ALL },
  ];

  const swaggerExclusions = SWAGGER_PROTECTED_PATHS.flatMap((path) => [
    { path, method: RequestMethod.ALL },
    { path: `${path}/(.*)`, method: RequestMethod.ALL },
    { path: `${path}-json`, method: RequestMethod.ALL },
    { path: `${path}-yaml`, method: RequestMethod.ALL },
  ]);

  consumer
    .apply(RequestIdMiddleware, TimezoneMiddleware)
    .exclude(...pubSubExclusions, ...swaggerExclusions)
    .forRoutes('*');
}

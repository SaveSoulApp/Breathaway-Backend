import { applyDecorators, UseGuards } from '@nestjs/common';

import { NonProductionGuard } from '@common/guards/non-production.guard';

/**
 * Restricts access to a controller or individual route handler to non-production environments.
 *
 * If either `NODE_ENV` or `DEPLOYMENT_ENV` is set to `production`, incoming requests
 * will be rejected immediately with an HTTP 404 NotFoundException via `NonProductionGuard`.
 */
export function NonProductionOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(NonProductionGuard));
}

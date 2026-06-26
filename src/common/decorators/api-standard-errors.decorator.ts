import { applyDecorators } from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

/**
 * Applies standard OpenAPI documentation for common HTTP error responses
 * across authenticated endpoints.
 *
 * Automatically documents the schemas and descriptions for 401 Unauthorized,
 * 403 Forbidden, and 500 Internal Server Error, ensuring consistent API
 * specifications without redundant annotations on every controller method.
 *
 * @returns A composite NestJS decorator containing the standard error responses.
 */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiUnauthorizedResponse({
      description: 'Missing or invalid authentication token',
    }),
    ApiForbiddenResponse({
      description: 'User lacks required permissions',
    }),
    ApiInternalServerErrorResponse({
      description: 'An unexpected system error occurred',
    }),
  );
}

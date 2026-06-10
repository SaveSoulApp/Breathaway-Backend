import { applyDecorators } from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

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

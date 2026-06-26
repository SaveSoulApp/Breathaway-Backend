import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/**
 * Extracts and strictly validates a required string parameter from the URL query string.
 *
 * Rejects undefined, null, non-string, or purely whitespace values before they reach
 * the controller layer, providing consistent 400 Bad Request error messages.
 *
 * @param paramName - The exact key name expected in the query string.
 * @returns The sanitized (trimmed) string value from the query parameter.
 * @throws {BadRequestException} When the parameter is missing, not a string, or empty.
 */
export const RequiredStringQuery = createParamDecorator(
  (paramName: string, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ query: Record<string, unknown> }>();
    const value = request.query[paramName];

    if (value === undefined || value === null) {
      throw new BadRequestException(`${paramName} is required`);
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${paramName} must be a string`);
    }

    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      throw new BadRequestException(`${paramName} cannot be empty`);
    }

    return trimmedValue;
  },
);

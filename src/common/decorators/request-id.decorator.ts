import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';

export interface RequestWithMetadata extends Request {
  requestId: string;
}

/**
 * Extracts the Request ID (Correlation ID) from the request object.
 *
 * The ID is expected to be populated by a global middleware (e.g., CorrelationIdMiddleware).
 * Used for distributed tracing and tying log entries to a specific incoming HTTP request.
 *
 * @returns The unique string identifier for the current request context.
 * @throws {InternalServerErrorException} When the request ID is missing, enforcing mandatory tracing.
 */
export const RequestId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithMetadata>();

    const id = request.requestId;

    if (!id) {
      // If logging/tracing is mandatory, we throw an exception.
      // If optional, we could return an empty string or 'N/A'.
      throw new InternalServerErrorException(
        'Request ID is missing. Ensure the CorrelationIdMiddleware is registered.',
      );
    }

    return id;
  },
);

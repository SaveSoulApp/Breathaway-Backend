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
 * This ID is expected to be populated by a global middleware.
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

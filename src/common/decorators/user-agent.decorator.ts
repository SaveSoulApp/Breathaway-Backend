import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extracts the client User-Agent string from the incoming HTTP request.
 *
 * Prioritizes `x-user-agent` (used by mobile apps for structured metadata),
 * falling back to the standard `user-agent` header (browsers, curl, API clients).
 *
 * @returns The resolved user agent string, or `undefined` if not present.
 */
export const UserAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const headers = request.headers;

    const xUserAgent = headers['x-user-agent'];
    if (typeof xUserAgent === 'string' && xUserAgent.trim().length > 0) {
      return xUserAgent.trim();
    }
    if (Array.isArray(xUserAgent) && xUserAgent.length > 0) {
      const first = xUserAgent[0]?.trim();
      if (first) return first;
    }

    const standardUserAgent = headers['user-agent'];
    if (
      typeof standardUserAgent === 'string' &&
      standardUserAgent.trim().length > 0
    ) {
      return standardUserAgent.trim();
    }

    return undefined;
  },
);

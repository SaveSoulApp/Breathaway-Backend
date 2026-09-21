import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { JwtPayload } from './current-user-id.decorator';

/**
 * Extracts the authenticated user's ID from the JWT payload injected into the request object,
 * if present. Returns `null` if the request is unauthenticated or the user payload is missing.
 *
 * Safe to use on routes protected by `OptionalJwtAuthGuard`.
 */
export const OptionalCurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload | null }>();

    return request.user?.userId ?? null;
  },
);

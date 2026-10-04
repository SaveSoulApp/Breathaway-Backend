import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { extractClientIp } from '@common/utils/request.utils';

/**
 * Extracts the public client IP address from the incoming HTTP request.
 *
 * In GCP Cloud Run and environments behind Google Cloud Load Balancing or reverse proxies,
 * the client's public IP address is provided as the first (leftmost) entry in the
 * `X-Forwarded-For` request header. Falls back to `req.ip` or `req.socket.remoteAddress`.
 *
 * @returns The resolved client IP string, or `undefined` if not detectable.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return extractClientIp(request);
  },
);

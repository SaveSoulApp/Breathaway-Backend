import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { extractClientIp } from '@common/utils/request.utils';

/**
 * Extracts the public client IP address from the incoming HTTP request.
 *
 * In GCP Cloud Run and environments behind Google Cloud Load Balancing or reverse proxies,
 * Express is configured with `trust proxy: 1` to resolve the verified public client IP in `req.ip`.
 * For raw or mock requests, falls back to the rightmost entry in the `X-Forwarded-For` header
 * (the IP appended by the trusted proxy) or `req.socket.remoteAddress`.
 *
 * @returns The resolved client IP string, or `undefined` if not detectable.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return extractClientIp(request);
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { UserAgentUtils } from '@common/utils/user-agent.utils';

/**
 * Extracts the canonical client User-Agent string from the incoming HTTP request.
 *
 * For native mobile clients (iOS/Android), prioritizes `x-user-agent` to preserve
 * structured app versioning and hardware telemetry.
 *
 * For web clients, prioritizes the browser's native `user-agent` header (even if
 * a synthetic placeholder like `AppName/1.0.0 (Web 1.0; Browser)` is present in `x-user-agent`),
 * ensuring accurate detection of the underlying browser, operating system, and hardware.
 *
 * @returns The resolved canonical user agent string, or `undefined` if not present.
 */
export const UserAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return UserAgentUtils.resolveCanonicalUserAgent(request.headers);
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the user's timezone from the request object.
 *
 * The value is expected to be populated by an upstream middleware or guard based on
 * user preferences or headers. This guarantees a safe fallback to 'UTC' if no
 * timezone is provided, preventing localized logic from failing unexpectedly.
 *
 * @returns The IANA timezone string (e.g., 'Asia/Kolkata'), defaulting to 'UTC'.
 */
export const Timezone = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // Using the augmented Request type, we access 'timezone' safely.
    // We provide a fallback to 'UTC' to satisfy the 'string' return type
    // and maintain application stability.
    return request.timezone ?? 'UTC';
  },
);

import { SkipThrottle } from '@nestjs/throttler';

/**
 * Completely bypasses all multi-tier rate limiters (short, medium, long, default).
 *
 * In `@nestjs/throttler` v5+, `@SkipThrottle()` defaults to skipping only the 'default'
 * throttler. When named throttlers ('short', 'medium', 'long') are configured in
 * `app.module.ts`, this decorator explicitly marks all named tiers as skipped.
 */
export const SkipAllThrottles = (): MethodDecorator & ClassDecorator =>
  SkipThrottle({
    default: true,
    short: true,
    medium: true,
    long: true,
  });

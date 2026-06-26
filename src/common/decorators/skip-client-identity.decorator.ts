import { SKIP_CLIENT_IDENTITY_META } from '@common/guards/client-identity.guard';
import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Bypasses the global ClientIdentityGuard validation (API Key, Client ID, Device ID, App Version).
 *
 * Use strictly for endpoints that cannot furnish client headers — such as external
 * webhooks, cron jobs, or 3rd-party integrations — to prevent accidental lockouts.
 *
 * @returns A metadata decorator that flags the route to skip client identity checks.
 */
export const SkipClientIdentity = (): CustomDecorator =>
  SetMetadata(SKIP_CLIENT_IDENTITY_META, true);

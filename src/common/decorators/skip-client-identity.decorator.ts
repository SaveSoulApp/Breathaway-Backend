import { SKIP_CLIENT_IDENTITY_META } from '@common/guards/client-identity.guard';
import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Bypasses the global ClientIdentityGuard validation (API Key, Client ID, Device ID, App Version).
 * Use strictly for external webhooks, cron jobs, or 3rd-party integrations.
 */
export const SkipClientIdentity = (): CustomDecorator =>
  SetMetadata(SKIP_CLIENT_IDENTITY_META, true);

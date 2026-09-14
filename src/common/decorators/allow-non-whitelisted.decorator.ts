import { SetMetadata } from '@nestjs/common';

export const ALLOW_NON_WHITELISTED_KEY = 'allow_non_whitelisted';

/**
 * Class decorator applied to DTOs (e.g. third-party webhooks) that must tolerate
 * unexpected or newly added properties without failing validation when
 * `forbidNonWhitelisted: true` is globally configured.
 */
export const AllowNonWhitelisted = () =>
  SetMetadata(ALLOW_NON_WHITELISTED_KEY, true);

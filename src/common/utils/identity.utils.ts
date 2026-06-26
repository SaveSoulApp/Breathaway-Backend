import { IdentityType } from '@prisma/client';

/**
 * Normalizes user identity values (email, phone, or social handles) to a standard format
 * for consistent database querying and uniqueness checks.
 *
 * @param value - The raw identity string provided by the user.
 * @param type - The category of the identity, determining the normalization strategy.
 * @returns The sanitized and normalized string.
 */
export function normalizeIdentityValue(
  value: string,
  type: IdentityType,
): string {
  switch (type) {
    case IdentityType.EMAIL:
      return value.trim().toLowerCase();
    case IdentityType.PHONE:
      return value.replace(/\D/g, '');
    case IdentityType.INSTAGRAM:
    case IdentityType.LINKEDIN:
      return value.replace(/^@/, '').trim().toLowerCase();
    default:
      return value.trim().toLowerCase();
  }
}

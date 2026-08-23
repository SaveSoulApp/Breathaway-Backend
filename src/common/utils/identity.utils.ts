import { IdentityType } from '@prisma/client';

/**
 * Normalizes user identity values (email, phone, or social handles) to a standard format
 * for consistent database querying and uniqueness checks.
 *
 * For PHONE identities the canonical form is E.164 digits-only (e.g. `919876541491`
 * for `+919876541491`). The leading `+` is intentionally stripped so that an E.164
 * number and its digits-only equivalent hash identically.
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
      // Strip ALL non-digit characters (including the leading `+`) to produce a
      // pure digit string for deterministic hashing. Country code application
      // must happen BEFORE this call via `applyCountryCode`.
      return value.replace(/\D/g, '');
    case IdentityType.INSTAGRAM:
    case IdentityType.LINKEDIN:
      return value.replace(/^@/, '').trim().toLowerCase();
    default:
      return value.trim().toLowerCase();
  }
}

/**
 * Determines whether `value` is already in E.164 format.
 *
 * A valid E.164 number starts with `+` followed by 7 to 15 digits (ITU-T E.164 limits).
 *
 * @param value - The phone number string to test.
 * @returns `true` when `value` is already fully-qualified with a country code.
 */
export function isE164Phone(value: string): boolean {
  return /^\+\d{7,15}$/.test(value.trim());
}

/**
 * Prepends `countryCode` onto `rawPhone` when `rawPhone` is not already in E.164 format.
 *
 * `countryCode` must be the isolated country code prefix including the leading `+`
 * (e.g. `"+91"`, `"+1"`, `"+852"`). Use `IdentitiesService.getSenderCountryCode` to
 * obtain this value reliably from the sender's stored masked identity.
 *
 * If `rawPhone` is already E.164 it is returned unchanged. If `countryCode` does not
 * start with `+` the function returns `rawPhone` unchanged as a safety guard.
 *
 * @param rawPhone    - The phone number as supplied by the client (may lack a country code).
 * @param countryCode - The isolated country code prefix including `+` (e.g. `"+91"`).
 * @returns The enriched phone string in E.164 format, or `rawPhone` unchanged when
 *   enrichment is not possible.
 *
 * @example
 * applyCountryCode('9876541491', '+91')  // → '+919876541491'
 * applyCountryCode('+919876541491', '+91') // → '+919876541491' (already E.164)
 */
export function applyCountryCode(
  rawPhone: string,
  countryCode: string,
): string {
  if (isE164Phone(rawPhone)) {
    return rawPhone;
  }

  if (!countryCode.startsWith('+')) {
    return rawPhone;
  }

  return `${countryCode}${rawPhone.trim()}`;
}

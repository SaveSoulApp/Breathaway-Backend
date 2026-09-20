import { isValidPhoneNumber, parsePhoneNumberWithError } from 'libphonenumber-js';

/**
 * Extracts the ISO 3166-1 alpha-2 country code from a phone number in E.164 format.
 *
 * Uses `libphonenumber-js` to parse the number and resolve the originating country.
 * All auth phone numbers in this application are guaranteed to be in E.164 format
 * (e.g., `+919876543210` for India, `+14155552671` for the US) by Firebase Auth.
 *
 * Returns `null` when:
 * - The input is not a structurally valid E.164 number.
 * - The library cannot map the dial prefix to a unique country
 *   (rare edge case for shared dial codes like `+1` — resolved unambiguously for
 *   full numbers in practice, but null-safe guards are applied anyway).
 *
 * Callers should treat a `null` return as "country unknown" and apply a
 * configured default downstream (e.g., when serving pricing to email-only users).
 *
 * @param e164Phone - Phone number in E.164 format (must include the `+` prefix).
 * @returns Two-letter ISO 3166-1 alpha-2 country code (e.g., `"IN"`, `"US"`, `"GB"`), or `null`.
 *
 * @example
 * extractCountryCodeFromPhone('+919876543210'); // → 'IN'
 * extractCountryCodeFromPhone('+14155552671');  // → 'US'
 * extractCountryCodeFromPhone('+447911123456'); // → 'GB'
 * extractCountryCodeFromPhone('invalid');       // → null
 */
export function extractCountryCodeFromPhone(e164Phone: string): string | null {
  try {
    if (!isValidPhoneNumber(e164Phone)) return null;
    return parsePhoneNumberWithError(e164Phone).country ?? null;
  } catch {
    // libphonenumber-js throws on structurally broken input (e.g., empty string).
    return null;
  }
}

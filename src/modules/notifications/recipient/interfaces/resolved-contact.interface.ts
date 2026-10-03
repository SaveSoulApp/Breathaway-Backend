/**
 * Resolved, decrypted email contact for a notification recipient.
 */
export interface ResolvedEmailContact {
  userId: string;
  email: string;
  firstName?: string;
}

/**
 * Resolved, decrypted, and standardized phone contact for a notification recipient.
 */
export interface ResolvedPhoneContact {
  userId: string;
  /**
   * Recipient phone in ITU-T E.164 digits-only format without the leading "+"
   * Example: "919876543210"
   */
  phoneDigits: string;
  /**
   * Full E.164 formatted string including the leading "+"
   * Example: "+919876543210"
   */
  e164Formatted: string;
  firstName?: string;
}

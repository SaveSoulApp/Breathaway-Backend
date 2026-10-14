import { ConsentChannel, ConsentSource, Prisma } from '@prisma/client';

export interface InitialConsentOptions {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Builds the initial default consent records across all communication channels for user registration.
 *
 * Ensures all non-essential and marketing communication channels receive an explicit, immutable
 * consent record at account creation time, referencing the user's agreement to the Terms of Service
 * and Privacy Policy during onboarding (GDPR Article 7 / ePrivacy compliance).
 *
 * @param options - Optional client context including IP address and user agent.
 * @returns Array of consent ledger inputs for nested user creation.
 */
export function buildInitialConsentRecords(
  options?: InitialConsentOptions,
): Prisma.ConsentLedgerCreateWithoutUserInput[] {
  const ipAddress = options?.ipAddress;
  const userAgent = options?.userAgent;

  return [
    {
      channel: ConsentChannel.PUSH,
      consentGranted: true,
      source: ConsentSource.SIGNUP,
      ipAddress,
      userAgent,
    },
    {
      channel: ConsentChannel.EMAIL,
      consentGranted: true,
      source: ConsentSource.SIGNUP,
      ipAddress,
      userAgent,
    },
    {
      channel: ConsentChannel.SMS,
      consentGranted: true,
      source: ConsentSource.SIGNUP,
      ipAddress,
      userAgent,
    },
    {
      channel: ConsentChannel.WHATSAPP,
      consentGranted: true,
      source: ConsentSource.SIGNUP,
      ipAddress,
      userAgent,
    },
  ];
}

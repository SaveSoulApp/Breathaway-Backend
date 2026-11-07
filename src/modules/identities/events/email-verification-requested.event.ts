export const EMAIL_VERIFICATION_REQUESTED_EVENT =
  'identity.email_verification_requested';

/**
 * Domain event emitted when an authenticated user requests OTP verification
 * for an email address to link to their account.
 */
export class EmailVerificationRequestedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly otp: string,
    public readonly expiresInSeconds: number,
  ) {}
}

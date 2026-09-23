export const IDENTITY_ADDED_EVENT = 'identity.added';

export class IdentityAddedEvent {
  constructor(
    public readonly userId: string,
    public readonly identityType: string,
    public readonly maskedValue: string,
    public readonly isVerified: boolean = false,
  ) {}
}

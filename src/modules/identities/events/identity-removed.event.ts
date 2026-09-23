export const IDENTITY_REMOVED_EVENT = 'identity.removed';

export class IdentityRemovedEvent {
  constructor(
    public readonly userId: string,
    public readonly identityType: string,
    public readonly maskedValue: string,
  ) {}
}

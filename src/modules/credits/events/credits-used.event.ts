export const CREDITS_USED_EVENT = 'credits.used';

export class CreditsUsedEvent {
  constructor(
    public readonly userId: string,
    public readonly amount: number,
    public readonly balance: number,
  ) {}
}

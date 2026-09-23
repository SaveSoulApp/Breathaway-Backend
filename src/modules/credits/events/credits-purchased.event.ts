export const CREDITS_PURCHASED_EVENT = 'credits.purchased';

export class CreditsPurchasedEvent {
  constructor(
    public readonly userId: string,
    public readonly amount: number,
    public readonly balance: number,
    public readonly referenceId: string | null = null,
    public readonly expiresAt: Date | null = null,
  ) {}
}

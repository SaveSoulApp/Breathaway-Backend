export const LIKE_SENT_EVENT = 'like.sent';

export class LikeSentEvent {
  constructor(
    public readonly userId: string,
    public readonly targetMaskedValue: string,
    public readonly targetLabel: string | null = null,
    public readonly intent: string = 'ROMANTIC',
    public readonly expiresAt: Date | null = null,
  ) {}
}

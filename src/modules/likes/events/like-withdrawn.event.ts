export const LIKE_WITHDRAWN_EVENT = 'like.withdrawn';

export class LikeWithdrawnEvent {
  constructor(
    public readonly userId: string,
    public readonly targetMaskedValue: string,
    public readonly targetLabel: string | null = null,
  ) {}
}

export const LIKES_EXPIRED_EVENT = 'likes.expired';

export class LikesExpiredEvent {
  constructor(
    public readonly userId: string,
    public readonly count: number,
    public readonly expiryDate: string,
  ) {}
}

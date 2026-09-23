export const MATCH_CREATED_EVENT = 'match.created';

export class MatchCreatedEvent {
  constructor(
    public readonly matchId: string,
    public readonly userOneId: string,
    public readonly userTwoId: string,
    public readonly likeOneLabel: string | null = null,
    public readonly likeTwoLabel: string | null = null,
  ) {}
}

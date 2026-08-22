export const USER_DELETED_EVENT = 'user.deleted';

export class UserDeletedEvent {
  constructor(public readonly userId: string) {}
}

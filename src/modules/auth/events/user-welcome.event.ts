export const USER_WELCOME_EVENT = 'user.welcome';

export class UserWelcomeEvent {
  constructor(public readonly userId: string) {}
}

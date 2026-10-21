import { randomInt } from 'crypto';

/**
 * High-entropy combinatorial natural language message synthesizer for Instagram verification replies.
 *
 * Generates organic, conversational English confirmation messages embedding the user's
 * Instagram handle across varied greetings, verification confirmations, next steps, and sign-offs.
 * This structural and lexical variation breaks repetitive pattern matching in Meta's
 * automated spam classifiers (e.g. SimHash / LSH inbox clustering) when sending automated DMs.
 */
export class InstagramVerificationResponseGenerator {
  private static readonly GREETINGS = [
    'Woohoo @{username}!',
    'Hey @{username}!',
    'Hi @{username},',
    'Great news @{username}!',
    'Hello @{username}!',
    'Awesome @{username}!',
    'Hey there @{username}!',
    'Good news @{username},',
    'Hi there @{username}!',
    'Congratulations @{username}!',
    'All set @{username}!',
    'Welcome @{username}!',
    'Hey @{username}, great news!',
    'Hi @{username}, you are all set!',
    'Hello @{username}, wonderful news!',
  ];

  private static readonly CONFIRMATIONS = [
    'Your Instagram identity is now connected to BreathAway.',
    'Your Instagram account has been successfully linked.',
    'Your profile connection is complete and confirmed.',
    'Your Instagram handle is now active on your account.',
    'Your account connection has gone through successfully.',
    'Your identity is officially linked on BreathAway.',
    'Your profile link is now fully active.',
    'Your Instagram connection has been successfully confirmed.',
    'We have confirmed and linked your Instagram presence.',
    'Your badge and profile status are now active in BreathAway.',
    'Your Instagram connection has been authenticated and linked.',
    'Your identity setup has been successfully completed.',
  ];

  private static readonly NEXT_STEPS = [
    'You can now head back and enjoy exploring.',
    'You are ready to start discovering meaningful connections.',
    'Feel free to return to BreathAway to continue.',
    'Your profile is ready for authentic connections.',
    'You can now return and make the most of your profile.',
    'Everything is set up and waiting for you.',
    'Head over to check out your updated profile.',
    'You are all geared up to explore BreathAway.',
    'Jump right back in whenever you are ready.',
    'Your presence is now live across the platform.',
  ];

  private static readonly SIGN_OFFS = [
    'See you there! ✨',
    'Cheers, Team BreathAway! 💙',
    'Have a wonderful time! 🎉',
    'Best wishes, The BreathAway Team 💫',
    'Enjoy the journey! 🚀',
    'Talk soon! 🌟',
    'Happy connecting! 🥂',
    'Warm regards, Team BreathAway ✨',
    'Welcome aboard! 🎈',
    'Have a great day ahead! ☀️',
  ];

  /**
   * Synthesizes an organic, varied confirmation message for the verified Instagram user.
   *
   * @param username - The verified Instagram username/handle.
   * @returns A friendly, unique message ready to be sent via Instagram DM.
   */
  static generateSuccessMessage(username: string): string {
    const cleanUsername = username.replace(/^@/, '').trim();
    const greeting = this.pickRandom(this.GREETINGS).replace(
      '{username}',
      cleanUsername,
    );
    const confirmation = this.pickRandom(this.CONFIRMATIONS);
    const nextStep = this.pickRandom(this.NEXT_STEPS);
    const signOff = this.pickRandom(this.SIGN_OFFS);

    return `${greeting} ${confirmation} ${nextStep} ${signOff}`;
  }

  private static pickRandom<T>(items: readonly T[]): T {
    const index = randomInt(items.length);
    return items[index];
  }
}

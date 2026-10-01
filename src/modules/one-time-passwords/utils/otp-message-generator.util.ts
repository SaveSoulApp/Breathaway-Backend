import { randomInt } from 'crypto';

/**
 * High-entropy combinatorial natural language message synthesizer for Instagram OTP verification.
 *
 * Generates organic, conversational English messages embedding the 3-word slug across
 * varied greetings, user intent statements, code connectors, and sign-offs.
 * This structural and lexical variation breaks repetitive pattern matching in Meta's
 * automated spam classifiers (e.g. SimHash / LSH inbox clustering).
 */
export class OtpMessageGenerator {
  private static readonly GREETINGS = [
    'Hi Breathaway team,',
    'Hey Breathaway!',
    'Hello Breathaway team,',
    'Hi there,',
    'Hey team,',
    'Good day,',
    'Hello there!',
    'Hi everyone,',
    'Hey guys,',
    'Greetings Breathaway,',
    'Hello!',
    'Hi Breathaway,',
    'Hey there!',
    'Good morning Breathaway team,',
    'Good afternoon,',
    'Quick hello to the team,',
    'Hiya Breathaway!',
    'Hey everyone,',
    'Warm greetings from a new user,',
    'Hi team Breathaway,',
  ];

  private static readonly INTENTS = [
    'Setting up my Breathaway account.',
    'Linking my Instagram profile to my account.',
    'Connecting my Instagram to Breathaway.',
    'Just registered on the Breathaway app.',
    'Verifying my account today.',
    'Claiming my profile from the app.',
    'Super excited to get started with Breathaway!',
    'Finishing up my registration on Breathaway.',
    'Confirming my profile verification.',
    'Registering my profile here.',
    'Authenticating my Instagram handle.',
    'Sending over my verification details.',
    'Validating my profile for the app.',
    'Syncing my Instagram account with Breathaway.',
    'Here to verify my account profile.',
    'Completing my onboarding on Breathaway.',
    'Following up on the app verification step.',
    'Finalizing my account setup.',
    'Activating my Breathaway profile.',
    'Connecting my social identity to Breathaway.',
  ];

  private static readonly CONNECTORS = [
    'My verification code:',
    'Here is my reference code:',
    'Verification code:',
    'My link code:',
    'Account code:',
    'My reference tag:',
    'Connecting code:',
    'Reference ID:',
    'Here is my verification key:',
    'Security code:',
    'My activation code:',
    'Profile link code:',
    'My verification tag:',
    'Account verification ID:',
    'Access code:',
  ];

  private static readonly CLOSINGS = [
    'Thanks a lot!',
    'Please confirm when linked.',
    'Excited to be here!',
    'Have a great day!',
    'Appreciate your help!',
    'Cheers!',
    'Looking forward to using the app!',
    'Let me know once verified.',
    'Thank you!',
    'Cant wait to try the app!',
    'Many thanks!',
    'Much appreciated!',
    'Best wishes!',
    'Talk soon!',
    'Appreciate the assistance!',
    'Looking forward to getting started!',
    'Thanks for the support!',
    'Have a wonderful day ahead!',
    'Super pumped to explore the app!',
    'Thanks in advance!',
  ];

  /**
   * Synthesizes a natural English message embedding the given OTP slug.
   *
   * @param slug - The 3-word OTP slug (e.g. 'rapid-amber-summit').
   * @returns A friendly, organic message ready to be sent via Instagram DM.
   */
  static generateMessage(slug: string): string {
    const greeting = this.pickRandom(this.GREETINGS);
    const intent = this.pickRandom(this.INTENTS);
    const connector = this.pickRandom(this.CONNECTORS);
    const closing = this.pickRandom(this.CLOSINGS);

    return `${greeting} ${intent} ${connector} ${slug} - ${closing}`;
  }

  private static pickRandom<T>(items: readonly T[]): T {
    const index = randomInt(items.length);
    return items[index];
  }
}

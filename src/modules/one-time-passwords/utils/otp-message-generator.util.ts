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
    'Just registered on Breathaway.',
    'Setting up my profile today.',
    'Claiming my profile on Breathaway.',
    'Super excited to get started with Breathaway!',
    'Finishing up my registration on Breathaway.',
    'Confirming my profile connection.',
    'Registering my profile here.',
    'Authenticating my Instagram handle.',
    'Sending over my connection details.',
    'Validating my profile on Breathaway.',
    'Syncing my Instagram account with Breathaway.',
    'Here to connect my account profile.',
    'Completing my onboarding on Breathaway.',
    'Following up on my setup.',
    'Finalizing my account setup.',
    'Activating my Breathaway profile.',
    'Connecting my social identity to Breathaway.',
  ];

  private static readonly CONNECTORS = [
    'My reference tag:',
    'Here is my reference tag:',
    'Reference tag:',
    'My link tag:',
    'Account tag:',
    'My reference key:',
    'Connecting tag:',
    'Reference ID:',
    'Here is my reference key:',
    'Security tag:',
    'My activation tag:',
    'Profile link tag:',
    'My profile reference:',
    'Account reference ID:',
    'Access key:',
  ];

  private static readonly CLOSINGS = [
    'Thanks a lot!',
    'Please confirm when linked.',
    'Excited to be here!',
    'Have a great day!',
    'Appreciate your help!',
    'Cheers!',
    'Looking forward to getting started!',
    'Let me know once linked.',
    'Thank you!',
    'Cant wait to get started!',
    'Many thanks!',
    'Much appreciated!',
    'Best wishes!',
    'Talk soon!',
    'Appreciate the assistance!',
    'Looking forward to exploring!',
    'Thanks for the support!',
    'Have a wonderful day ahead!',
    'Super pumped to explore Breathaway!',
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

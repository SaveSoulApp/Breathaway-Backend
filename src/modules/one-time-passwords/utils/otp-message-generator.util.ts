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
  ];

  private static readonly CONNECTORS = [
    'My verification code is',
    'Here is my reference code:',
    'Verification code:',
    'My link code is',
    'Account code:',
    'My reference tag is',
    'Connecting with code:',
    'Reference ID:',
    'Here is my verification key:',
    'Security code:',
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
    'Can’t wait to try the app!',
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

    return `${greeting} ${intent} ${connector} ${slug}. ${closing}`;
  }

  private static pickRandom<T>(items: readonly T[]): T {
    const index = Math.floor(Math.random() * items.length);
    return items[index];
  }
}

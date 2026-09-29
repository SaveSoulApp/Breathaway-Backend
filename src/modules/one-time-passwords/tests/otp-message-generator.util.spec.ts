import { OtpMessageGenerator } from '../utils/otp-message-generator.util';

describe('OtpMessageGenerator', () => {
  const sampleSlug = 'rapid-amber-summit';

  it('should include the exact slug in the generated message', () => {
    const message = OtpMessageGenerator.generateMessage(sampleSlug);
    expect(message).toContain(sampleSlug);
  });

  it('should generate diverse messages across multiple runs', () => {
    const messages = new Set<string>();
    const runs = 25;

    for (let i = 0; i < runs; i++) {
      messages.add(OtpMessageGenerator.generateMessage(sampleSlug));
    }

    // With 10,000 permutations, 25 runs should yield high diversity (at least 15 unique messages)
    expect(messages.size).toBeGreaterThan(15);
  });

  it('should format message with proper punctuation and spacing', () => {
    const message = OtpMessageGenerator.generateMessage(sampleSlug);

    expect(message.length).toBeGreaterThan(sampleSlug.length + 20);
    expect(message.trim()).toEqual(message);
    expect(message).toMatch(/\brapid-amber-summit\b/);
  });
});

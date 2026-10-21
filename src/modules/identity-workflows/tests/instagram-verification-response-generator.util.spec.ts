import { InstagramVerificationResponseGenerator } from '../utils/instagram-verification-response-generator.util';

describe('InstagramVerificationResponseGenerator', () => {
  const sampleUsername = 'johndoe';

  it('should include the sanitized handle in the generated message', () => {
    const message =
      InstagramVerificationResponseGenerator.generateSuccessMessage(
        sampleUsername,
      );
    expect(message).toContain('@johndoe');
    expect(message).not.toContain('@@johndoe');
  });

  it('should strip leading @ from input username and not duplicate @', () => {
    const message =
      InstagramVerificationResponseGenerator.generateSuccessMessage('@johndoe');
    expect(message).toContain('@johndoe');
    expect(message).not.toContain('@@johndoe');
  });

  it('should generate diverse messages across multiple runs to defeat spam clustering', () => {
    const messages = new Set<string>();
    const runs = 30;

    for (let i = 0; i < runs; i++) {
      messages.add(
        InstagramVerificationResponseGenerator.generateSuccessMessage(
          sampleUsername,
        ),
      );
    }

    // With 18,000 combinations, 30 runs should yield high diversity (> 20 unique messages)
    expect(messages.size).toBeGreaterThan(20);
  });

  it('should format message with proper length, spacing, and ending punctuation', () => {
    const message =
      InstagramVerificationResponseGenerator.generateSuccessMessage(
        sampleUsername,
      );

    expect(message.length).toBeGreaterThan(sampleUsername.length + 50);
    expect(message.trim()).toEqual(message);
    expect(message).toMatch(/@johndoe/);
  });

  it('should not contain forbidden words: verification, verified, verify, code, or app', () => {
    for (let i = 0; i < 100; i++) {
      const message =
        InstagramVerificationResponseGenerator.generateSuccessMessage(
          sampleUsername,
        );
      expect(message).not.toMatch(
        /\b(verify|verified|verification|verifying|code|codes|apps?)\b/i,
      );
    }
  });
});

import { NotificationType } from '../enums/notification-type.enum';
import { PUSH_TEMPLATE_MAP } from '../push-template.registry';

describe('PushTemplateRegistry', () => {
  it('should compile WELCOME template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.WELCOME];
    expect(config).toBeDefined();
    expect(config?.title({})).toBe('Welcome to BreathAway! 🎉');
    expect(config?.body({})).toBe('Explore matches and start connecting.');
  });

  describe('LIKE_SENT template', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.LIKE_SENT];

    it('should format body without targetLabel', () => {
      expect(config?.title({})).toBe('Like Sent! 💌');
      expect(config?.body({})).toBe(
        "We've sent your like! If they like you back, it's a match.",
      );
    });

    it('should format body with targetLabel', () => {
      expect(config?.body({ targetLabel: 'Priya' })).toBe(
        "We've sent your like to Priya! If they like you back, it's a match.",
      );
    });
  });

  it('should compile NEW_MATCH template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.NEW_MATCH];
    expect(config?.title({})).toBe("It's a Match! 💫");
    expect(config?.body({ matchName: 'Priya' })).toBe(
      'You and Priya liked each other.',
    );
  });

  it('should compile NEW_MESSAGE template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.NEW_MESSAGE];
    expect(config?.title({})).toBe('New Message 💬');
    expect(config?.body({ senderName: 'Rahul' })).toBe(
      'Rahul sent you a message.',
    );
  });

  it('should compile CREDIT_UPDATE template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.CREDIT_UPDATE];
    expect(config?.title({})).toBe('Credits Updated');
    expect(config?.body({ balance: 50 })).toBe('Your balance is now 50.');
  });

  it('should compile CREDITS_PURCHASED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.CREDITS_PURCHASED];
    expect(config?.title({})).toBe('Credits Purchased! 💳');
    expect(config?.body({ creditsAdded: 20, creditBalance: 35 })).toBe(
      '20 credits added. Your new balance is 35.',
    );
  });

  it('should compile SYSTEM_ALERT template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.SYSTEM_ALERT];
    expect(config?.title({ alertTitle: 'Scheduled Maintenance' })).toBe(
      'Scheduled Maintenance',
    );
    expect(
      config?.body({ alertBody: 'System will be down for 10 mins.' }),
    ).toBe('System will be down for 10 mins.');
  });

  describe('BUNDLE_EXPIRY_WARNING template', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.BUNDLE_EXPIRY_WARNING];

    it('should render normal expiry title when isUrgent is falsy', () => {
      expect(config?.title({ isUrgent: false })).toBe(
        'Credits Expiring Soon ⏳',
      );
    });

    it('should render urgent expiry title when isUrgent is true', () => {
      expect(config?.title({ isUrgent: true })).toBe(
        'Urgent: Credits Expiring! ⏳',
      );
    });

    it('should render expiry body with count and date', () => {
      expect(config?.body({ count: 10, expiryDate: 'October 25, 2026' })).toBe(
        '10 credits will expire on October 25, 2026. Use them before they are gone!',
      );
    });
  });

  it('should compile LIKES_EXPIRED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.LIKES_EXPIRED];
    expect(config?.title({})).toBe('Likes Expired ⏳');
    expect(config?.body({ count: 3 })).toBe(
      '3 of your pending likes have expired without a mutual match.',
    );
  });

  it('should compile IDENTITY_ADDED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.IDENTITY_ADDED];
    expect(config?.title({})).toBe('New Identity Added 🔒');
    expect(
      config?.body({ identityType: 'EMAIL', maskedValue: 'a•••z@test.com' }),
    ).toBe('A new EMAIL (a•••z@test.com) was linked to your account.');
  });

  it('should compile IDENTITY_REMOVED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.IDENTITY_REMOVED];
    expect(config?.title({})).toBe('Identity Removed 🔒');
    expect(
      config?.body({ identityType: 'PHONE', maskedValue: '+91•••••1234' }),
    ).toBe('A PHONE (+91•••••1234) was removed from your account.');
  });

  it('should compile CREDITS_USED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.CREDITS_USED];
    expect(config?.title({})).toBe('Credits Used ✨');
    expect(config?.body({ creditsUsed: 2, creditBalance: 8 })).toBe(
      'You used 2 credits. Remaining balance: 8.',
    );
  });

  it('should compile DEVICE_ADDED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.DEVICE_ADDED];
    expect(config?.title({})).toBe('New Device Added 📱');
    expect(config?.body({ platform: 'IOS' })).toBe(
      'A new IOS device was added to your BreathAway account.',
    );
  });

  describe('LIKE_WITHDRAWN template', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.LIKE_WITHDRAWN];

    it('should prioritize targetLabel when provided', () => {
      expect(config?.title({})).toBe('Like Withdrawn');
      expect(
        config?.body({
          targetLabel: 'Priya',
          targetMaskedValue: '+91•••••9999',
        }),
      ).toBe('Your like to Priya has been withdrawn.');
    });

    it('should fallback to targetMaskedValue when targetLabel is absent', () => {
      expect(config?.body({ targetMaskedValue: '+91•••••9999' })).toBe(
        'Your like to +91•••••9999 has been withdrawn.',
      );
    });
  });

  it('should compile PAYMENT_COMPLETED template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.PAYMENT_COMPLETED];
    expect(config?.title({})).toBe('Payment Successful! 💳');
    expect(
      config?.body({ currency: 'INR', amount: '399.00', creditsAdded: 10 }),
    ).toBe(
      'Payment of INR 399.00 was successful. 10 credits added to your account.',
    );
  });

  it('should compile DSAR_EXPORT_READY template correctly', () => {
    const config = PUSH_TEMPLATE_MAP[NotificationType.DSAR_EXPORT_READY];
    expect(config?.title({})).toBe('Personal Data Archive Ready 📦');
    expect(config?.body({})).toBe(
      'Your requested personal data archive is ready for download in settings.',
    );
  });
});

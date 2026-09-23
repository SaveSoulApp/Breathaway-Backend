import { EmailType } from '../enums/email-type.enum';

/**
 * Configuration entry for each email template type.
 * - `templateFile`: filename (no extension) relative to the templates/ directory
 * - `subject`: Handlebars template string for the email subject line
 */
export interface EmailTemplateConfig {
  templateFile: string;
  subject: string;
}

/**
 * Registry mapping every EmailType to its template configuration.
 *
 * To add a new email type:
 *   1. Add the value to EmailType enum
 *   2. Create the corresponding .hbs content file in templates/
 *   3. Add its entry here — no other files need changing
 */
export const EMAIL_TEMPLATE_MAP: Record<EmailType, EmailTemplateConfig> = {
  [EmailType.WELCOME]: {
    templateFile: 'welcome',
    subject: 'Welcome to BreathAway, {{name}}! 🌬️',
  },
  [EmailType.LIKE_SENT]: {
    templateFile: 'like-sent',
    subject: 'Your like has been sent! 💌',
  },
  [EmailType.NEW_MATCH]: {
    templateFile: 'new-match',
    subject: "It's a Match, {{name}}! 💫",
  },
  [EmailType.NEW_MESSAGE]: {
    templateFile: 'new-message',
    subject: '{{senderName}} sent you a message 💬',
  },
  [EmailType.CREDIT_UPDATE]: {
    templateFile: 'credit-update',
    subject: 'Your BreathAway credits have been updated',
  },
  [EmailType.CREDITS_PURCHASED]: {
    templateFile: 'credits-purchased',
    subject: 'Credits Purchase Confirmed! 💳',
  },
  [EmailType.SYSTEM_ALERT]: {
    templateFile: 'system-alert',
    subject: '{{alertTitle}} — BreathAway',
  },
  [EmailType.BUNDLE_EXPIRY_WARNING]: {
    templateFile: 'bundle-expiry-warning',
    subject:
      '{{#if isUrgent}}Urgent: {{count}} credits expiring soon! ⏳{{else}}Reminder: {{count}} credits expiring on {{expiryDate}} ⏳{{/if}}',
  },
  [EmailType.LIKES_EXPIRED]: {
    templateFile: 'likes-expired',
    subject: 'Update on your pending likes ⏳',
  },
  [EmailType.IDENTITY_ADDED]: {
    templateFile: 'identity-added',
    subject: 'Security Alert: New {{identityType}} added to your account 🔒',
  },
};

import * as Handlebars from 'handlebars';
import { NotificationType } from './enums/notification-type.enum';

/**
 * Configuration entry for each push notification template type.
 * - `title`: Pre-compiled Handlebars template for the notification title
 * - `body`: Pre-compiled Handlebars template for the notification body
 */
export interface PushTemplateConfig {
  title: Handlebars.TemplateDelegate;
  body: Handlebars.TemplateDelegate;
}

/**
 * Registry mapping every NotificationType to its default Push/WhatsApp template configuration.
 * Templates are pre-compiled at module load for performance.
 */
export const PUSH_TEMPLATE_MAP: Partial<
  Record<NotificationType, PushTemplateConfig>
> = {
  [NotificationType.WELCOME]: {
    title: Handlebars.compile('Welcome to BreathAway! 🎉'),
    body: Handlebars.compile('Explore matches and start connecting.'),
  },
  [NotificationType.LIKE_SENT]: {
    title: Handlebars.compile('Like Sent! 💌'),
    body: Handlebars.compile(
      "We've sent your like{{#if targetLabel}} to {{targetLabel}}{{/if}}! If they like you back, it's a match.",
    ),
  },
  [NotificationType.NEW_MATCH]: {
    title: Handlebars.compile("It's a Match! 💫"),
    body: Handlebars.compile('You and {{matchName}} liked each other.'),
  },
  [NotificationType.NEW_MESSAGE]: {
    title: Handlebars.compile('New Message 💬'),
    body: Handlebars.compile('{{senderName}} sent you a message.'),
  },
  [NotificationType.CREDIT_UPDATE]: {
    title: Handlebars.compile('Credits Updated'),
    body: Handlebars.compile('Your balance is now {{balance}}.'),
  },
  [NotificationType.CREDITS_PURCHASED]: {
    title: Handlebars.compile('Credits Purchased! 💳'),
    body: Handlebars.compile(
      '{{creditsAdded}} credits added. Your new balance is {{creditBalance}}.',
    ),
  },
  [NotificationType.SYSTEM_ALERT]: {
    title: Handlebars.compile('{{alertTitle}}'),
    body: Handlebars.compile('{{alertBody}}'),
  },
  [NotificationType.BUNDLE_EXPIRY_WARNING]: {
    title: Handlebars.compile(
      '{{#if isUrgent}}Urgent: Credits Expiring! ⏳{{else}}Credits Expiring Soon ⏳{{/if}}',
    ),
    body: Handlebars.compile(
      '{{count}} credits will expire on {{expiryDate}}. Use them before they are gone!',
    ),
  },
  [NotificationType.LIKES_EXPIRED]: {
    title: Handlebars.compile('Likes Expired ⏳'),
    body: Handlebars.compile(
      '{{count}} of your pending likes have expired without a mutual match.',
    ),
  },
  [NotificationType.IDENTITY_ADDED]: {
    title: Handlebars.compile('New Identity Added 🔒'),
    body: Handlebars.compile(
      'A new {{identityType}} ({{maskedValue}}) was linked to your account.',
    ),
  },
};

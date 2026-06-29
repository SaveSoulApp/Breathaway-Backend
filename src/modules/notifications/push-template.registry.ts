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
  [NotificationType.NEW_MATCH]: {
    title: Handlebars.compile("It's a Match! 💫"),
    body: Handlebars.compile('You and {{name}} liked each other.'),
  },
  [NotificationType.NEW_MESSAGE]: {
    title: Handlebars.compile('New Message 💬'),
    body: Handlebars.compile('{{senderName}} sent you a message.'),
  },
  [NotificationType.CREDIT_UPDATE]: {
    title: Handlebars.compile('Credits Updated'),
    body: Handlebars.compile('Your balance is now {{balance}}.'),
  },
  [NotificationType.SYSTEM_ALERT]: {
    title: Handlebars.compile('{{alertTitle}}'),
    body: Handlebars.compile('{{alertBody}}'),
  },
  [NotificationType.BUNDLE_EXPIRY_WARNING]: {
    title: Handlebars.compile('Your likes are expiring soon ⏳'),
    body: Handlebars.compile(
      "You have unused likes that will expire in 7 days. Use them before they're gone!",
    ),
  },
};

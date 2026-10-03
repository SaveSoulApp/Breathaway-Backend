import { NotificationType } from '../enums/notification-type.enum';

/**
 * Configuration entry for each WhatsApp template type.
 * - `template`: The canonical Meta-approved template name registered in LiteApp / Meta Business Manager.
 * - `language`: The template language code (e.g., 'en').
 * - `buildPayload`: Optional transformer function to extract placeholders/parameters from notification data.
 */
export interface WhatsAppTemplateConfig {
  template: string;
  language: string;
  buildPayload?: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registry mapping domain NotificationType to WhatsApp template configuration.
 */
export const WHATSAPP_TEMPLATE_MAP: Partial<
  Record<NotificationType, WhatsAppTemplateConfig>
> = {
  [NotificationType.NEW_MATCH]: {
    template: 'breathaway_new_match',
    language: 'en',
  },
  [NotificationType.WELCOME]: {
    template: 'breathaway_new_user_login',
    language: 'en',
  },
  [NotificationType.LIKE_SENT]: {
    template: 'breathaway_like_sent',
    language: 'en',
    buildPayload: (data) => ({
      ...(typeof data.buttonUrlVariable === 'string'
        ? { buttonUrlVariable: data.buttonUrlVariable }
        : { buttonUrlVariable: 'alerts' }),
    }),
  },
};

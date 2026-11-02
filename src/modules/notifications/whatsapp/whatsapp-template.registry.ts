import { NotificationType } from '../enums/notification-type.enum';

/**
 * LiteApp WhatsApp API Template Configuration & Contract
 *
 * Endpoint: POST https://www.liteapp.store/api/routes/plugins/whatsapp/send
 * Headers: Authorization: Bearer <LITEAPP_WHATSAPP_KEY>, Content-Type: application/json
 *
 * Variable Mapping Guidelines (LiteApp -> Meta WhatsApp Cloud API):
 *
 * 1. Message Body Placeholders ({{1}}, {{2}}, ...):
 *    - Must be provided as an ordered string array under the `variables` key:
 *      `"variables": ["Priya", "OptionalSecondParam"]`
 *    - Each index in the array maps sequentially to the positional placeholder
 *      in the approved template body (e.g. index 0 -> {{1}}, index 1 -> {{2}}).
 *    - Example: Body "Hi {{1}}!" -> `"variables": ["Priya"]`
 *
 * 2. Dynamic Button CTA URL (e.g. https://www.breathaway.app/{{1}}):
 *    - Must be provided as a string under the `buttonUrlVariable` key:
 *      `"buttonUrlVariable": "matches"`
 *    - LiteApp injects this string into the dynamic URL button component.
 *    - Example: Button "https://www.breathaway.app/{{1}}" -> `"buttonUrlVariable": "matches"`
 *      resolves to https://www.breathaway.app/matches.
 *
 * 3. Static Templates (No Variables):
 *    - If a template has static body text and static button URLs (or no buttons),
 *      neither `variables` nor `buttonUrlVariable` should be included in the payload
 *      (e.g., WELCOME template breathaway_new_user_login).
 */
export interface WhatsAppTemplateConfig {
  /** The canonical Meta-approved template name registered in LiteApp / Meta Business Manager */
  template: string;
  /** The template language code (e.g., 'en') */
  language: string;
  /**
   * Transforms raw domain notification data into LiteApp's expected payload format.
   * Returns an object that is spread directly into the LiteApp POST request body.
   */
  buildPayload?: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registry mapping domain NotificationType to WhatsApp template configuration.
 */
export const WHATSAPP_TEMPLATE_MAP: Partial<
  Record<NotificationType, WhatsAppTemplateConfig>
> = {
  /**
   * New match notification:
   * Uses dynamic CTA button URL pointing to /matches.
   */
  [NotificationType.NEW_MATCH]: {
    template: 'breathaway_new_match_v2',
    language: 'en',
    buildPayload: (data) => ({
      ...data,
      buttonUrlVariable:
        typeof data.buttonUrlVariable === 'string' &&
        data.buttonUrlVariable.trim().length > 0
          ? data.buttonUrlVariable.trim()
          : 'matches',
    }),
  },

  /**
   * Welcome notification on first login:
   * Static template with 0 body variables and static CTA button.
   */
  [NotificationType.WELCOME]: {
    template: 'breathaway_new_user_login',
    language: 'en',
  },

  /**
   * Sender confirmation for like sent:
   * Uses dynamic CTA button URL pointing to /alerts.
   */
  [NotificationType.LIKE_SENT]: {
    template: 'breathaway_like_sent',
    language: 'en',
    buildPayload: (data) => ({
      ...(typeof data.buttonUrlVariable === 'string'
        ? { buttonUrlVariable: data.buttonUrlVariable }
        : { buttonUrlVariable: 'alerts' }),
    }),
  },

  /**
   * Recipient alert when liked by someone:
   * - Body contains "{{1}}" placeholder -> sent as `"variables": ["<name>"]`.
   * - Button is a static URL (https://www.breathaway.app/) -> no buttonUrlVariable needed by default.
   */
  [NotificationType.LIKE_RECEIVED]: {
    template: 'breathaway_someone_liked_you_v2',
    language: 'en',
    buildPayload: (data) => {
      const name =
        typeof data.name === 'string' && data.name.trim().length > 0
          ? data.name.trim()
          : 'there';
      const variables =
        Array.isArray(data.variables) && data.variables.length > 0
          ? data.variables
          : [name];
      const payload: Record<string, unknown> = {
        variables,
      };
      if (
        typeof data.buttonUrlVariable === 'string' &&
        data.buttonUrlVariable.trim().length > 0
      ) {
        payload.buttonUrlVariable = data.buttonUrlVariable.trim();
      }
      return payload;
    },
  },
};

/**
 * Payload contract for WhatsApp messages passed to WhatsApp transport adapters.
 */
export interface WhatsAppSendPayload {
  /**
   * Recipient phone number in ITU-T E.164 digits-only format without the leading "+"
   * Example: "919876543210"
   */
  to: string;

  /**
   * Approved Meta template name
   * Example: "breathaway_new_match"
   */
  template: string;

  /**
   * Template language code (defaults to "en")
   */
  language?: string;

  /**
   * Optional custom parameters/variables for template buttons or body variables.
   * Example: { buttonUrlVariable: "matches" }
   */
  params?: Record<string, unknown>;
}

/**
 * Contract every WhatsApp transport adapter must fulfill.
 * Adapters are responsible only for the transport layer, delegating
 * business logic, deduplication, and phone resolution upstream.
 */
export interface IWhatsAppAdapter {
  /**
   * Sends a single WhatsApp template message via the underlying transport.
   *
   * @param payload - Recipient phone number, template name, language, and parameters.
   */
  send(payload: WhatsAppSendPayload): Promise<void>;
}

/** DI injection token for the active WhatsApp adapter */
export const WHATSAPP_ADAPTER_TOKEN = 'WHATSAPP_ADAPTER_TOKEN';

/**
 * Contract every email adapter must fulfil.
 * Adapters are responsible ONLY for transport — rendering happens upstream in EmailService.
 */
export interface EmailPayload {
  /** Resolved recipient email address */
  to: string;
  /** Rendered subject line (Handlebars already applied) */
  subject: string;
  /** Fully rendered HTML body (layout + content) */
  html: string;
  /** Override sender address; falls back to EMAIL_FROM_ADDRESS env var */
  from?: string;
  /** Override sender display name; falls back to EMAIL_FROM_NAME env var */
  fromName?: string;
}

export interface IEmailAdapter {
  /**
   * Sends a single email message via the underlying transport.
   * Throws on unrecoverable delivery failure so callers can decide on retry strategy.
   */
  send(payload: EmailPayload): Promise<void>;
}

/** DI injection token for the active email adapter */
export const EMAIL_ADAPTER_TOKEN = 'EMAIL_ADAPTER_TOKEN';

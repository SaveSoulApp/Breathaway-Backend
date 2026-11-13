import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { HttpClientService } from '@infrastructure/http';

import { EmailPayload, IEmailAdapter } from './email-adapter.interface';

/**
 * Resend email adapter for dispatching transactional emails via the Resend REST API.
 * Uses HttpClientService to enforce distributed tracing context, bounded timeouts, and structured logging.
 */
@Injectable()
export class ResendEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
  ) {
    super(loggerService);

    this.apiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not configured — Resend adapter will fail at send time',
      );
    }

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ?? '';
    if (!this.fromAddress) {
      this.logger.warn(
        'EMAIL_FROM_ADDRESS is not configured — Resend adapter will fail at send time',
      );
    }

    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ?? 'BreathAway';
  }

  /**
   * Sends a transactional email message via the Resend REST API (POST https://api.resend.com/emails).
   *
   * @param payload - Validated recipient, subject, HTML content, and optional sender overrides.
   * @throws Error if RESEND_API_KEY, recipient, or sender address is missing, or if delivery fails.
   */
  async send(payload: EmailPayload): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        '[Resend] Cannot send email: RESEND_API_KEY is not configured',
      );
    }

    if (!payload.to) {
      throw new Error(
        '[Resend] Cannot send email: recipient address is missing',
      );
    }

    const senderEmail = payload.from ?? this.fromAddress;
    if (!senderEmail) {
      throw new Error(
        '[Resend] Cannot send email: sender address is missing. Configure EMAIL_FROM_ADDRESS.',
      );
    }

    const senderName = payload.fromName ?? this.fromName;
    const from = senderName ? `${senderName} <${senderEmail}>` : senderEmail;

    try {
      await this.httpClient.post(
        'https://api.resend.com/emails',
        {
          from,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      this.logger.log('Email sent successfully', {
        provider: 'resend',
        step: 'complete',
      });
    } catch (error) {
      this.logger.error('Email send failed', {
        provider: 'resend',
        step: 'send',
        err: serializeError(error),
      });
      throw new Error(
        `Email delivery failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

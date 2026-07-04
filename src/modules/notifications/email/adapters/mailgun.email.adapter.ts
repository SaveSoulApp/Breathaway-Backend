import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import { EmailPayload, IEmailAdapter } from './email-adapter.interface';

/** Default to the US Mailgun API endpoint; override via MAILGUN_HOST for EU. */
const DEFAULT_MAILGUN_HOST = 'api.mailgun.net';

@Injectable()
export class MailgunEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly apiBaseUrl: string;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    this.apiKey = this.configService.get<string>('MAILGUN_API_KEY') ?? '';
    this.domain = this.configService.get<string>('MAILGUN_DOMAIN') ?? '';

    if (!this.apiKey) {
      this.logger.warn(
        'MAILGUN_API_KEY is not configured — Mailgun adapter will fail at send time',
      );
    }

    if (!this.domain) {
      this.logger.warn(
        'MAILGUN_DOMAIN is not configured — Mailgun adapter will fail at send time',
      );
    }

    const host =
      this.configService.get<string>('MAILGUN_HOST') ?? DEFAULT_MAILGUN_HOST;

    // Mailgun REST endpoint: POST /v3/{domain}/messages
    this.apiBaseUrl = `https://${host}/v3/${this.domain}`;

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ?? '';
    if (!this.fromAddress) {
      this.logger.warn(
        'EMAIL_FROM_ADDRESS is not configured — Mailgun adapter will fall back to an empty sender',
      );
    }

    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ?? 'BreathAway';
  }

  async send(payload: EmailPayload): Promise<void> {
    if (!payload.to) {
      throw new Error(
        '[Mailgun] Cannot send email: recipient address is missing',
      );
    }

    if (!payload.html) {
      throw new Error(
        '[Mailgun] Cannot send email: html body is missing or empty',
      );
    }

    const from = `${payload.fromName ?? this.fromName} <${payload.from ?? this.fromAddress}>`;

    // Mailgun's /messages endpoint accepts multipart/form-data
    const form = new FormData();
    form.append('from', from);
    form.append('to', payload.to);
    form.append('subject', payload.subject);
    form.append('html', payload.html);

    try {
      await axios.post(`${this.apiBaseUrl}/messages`, form, {
        auth: {
          // Mailgun uses HTTP Basic Auth with literal string "api" as the username
          username: 'api',
          password: this.apiKey,
        },
        headers: form.getHeaders(),
      });

      this.logger.log('Email sent successfully', {
        provider: 'mailgun',
        step: 'complete',
      });
    } catch (error) {
      this.logger.error('Email send failed', {
        provider: 'mailgun',
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

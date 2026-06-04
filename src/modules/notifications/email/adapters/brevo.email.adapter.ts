import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmailPayload, IEmailAdapter } from './email-adapter.interface';

@Injectable()
export class BrevoEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    this.apiKey = this.configService.get<string>('BREVO_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn(
        'BREVO_API_KEY is not configured — Brevo adapter will fail at send time',
      );
    }

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ?? '';
    if (!this.fromAddress) {
      this.logger.warn(
        'EMAIL_FROM_ADDRESS is not configured — Brevo adapter will fail at send time',
      );
    }

    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ?? 'BreathAway';
  }

  async send(payload: EmailPayload): Promise<void> {
    if (!payload.to) {
      throw new Error(
        '[Brevo] Cannot send email: recipient address is missing',
      );
    }

    const sender = {
      email: payload.from ?? this.fromAddress,
      name: payload.fromName ?? this.fromName,
    };

    try {
      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender,
          to: [{ email: payload.to }],
          subject: payload.subject,
          htmlContent: payload.html,
          ...(payload.html ? { textContent: payload.html } : {}),
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`[Brevo] Email sent successfully to: ${payload.to}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Brevo] Failed to send email to ${payload.to}:`, {
        error: message,
      });
      throw new Error(`Email delivery failed: ${message}`);
    }
  }
}

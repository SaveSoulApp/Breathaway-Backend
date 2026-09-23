import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

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
    if (!this.apiKey) {
      throw new Error(
        '[Brevo] Cannot send email: BREVO_API_KEY is not configured',
      );
    }

    if (!payload.to) {
      throw new Error(
        '[Brevo] Cannot send email: recipient address is missing',
      );
    }

    const senderEmail = payload.from ?? this.fromAddress;
    if (!senderEmail) {
      throw new Error(
        '[Brevo] Cannot send email: sender address is missing. Configure EMAIL_FROM_ADDRESS.',
      );
    }

    const sender = {
      email: senderEmail,
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
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      this.logger.log('Email sent successfully', {
        provider: 'brevo',
        step: 'complete',
      });
    } catch (error) {
      this.logger.error('Email send failed', {
        provider: 'brevo',
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

import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailPayload, IEmailAdapter } from './email-adapter.interface';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const mailgunTransport = require('nodemailer-mailgun-transport');

@Injectable()
export class MailgunEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');

    if (!apiKey || !domain) {
      this.logger.warn(
        'MAILGUN_API_KEY or MAILGUN_DOMAIN is not configured — Mailgun adapter will fail at send time',
      );
    }

    this.transporter = nodemailer.createTransport(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
      mailgunTransport({
        auth: { api_key: apiKey ?? '', domain: domain ?? '' },
      }),
    );

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ?? '';
    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ?? 'BreathAway';
  }

  async send(payload: EmailPayload): Promise<void> {
    const fromFormatted = `${payload.fromName ?? this.fromName} <${payload.from ?? this.fromAddress}>`;

    try {
      await this.transporter.sendMail({
        from: fromFormatted,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });

      this.logger.log(`[Mailgun] Email sent successfully to: ${payload.to}`);
    } catch (error) {
      this.logger.error(`[Mailgun] Failed to send email to ${payload.to}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

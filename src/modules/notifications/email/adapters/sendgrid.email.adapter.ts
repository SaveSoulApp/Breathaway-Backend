import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import SendGrid from '@sendgrid/mail';
import { EmailPayload, IEmailAdapter } from './email-adapter.interface';

@Injectable()
export class SendGridEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(loggerService);

    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'SENDGRID_API_KEY is not configured — SendGrid adapter will fail at send time',
      );
    } else {
      SendGrid.setApiKey(apiKey);
    }

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM_ADDRESS') ?? '';
    this.fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') ?? 'BreathAway';
  }

  async send(payload: EmailPayload): Promise<void> {
    const from = {
      email: payload.from ?? this.fromAddress,
      name: payload.fromName ?? this.fromName,
    };

    try {
      await SendGrid.send({
        to: payload.to,
        from,
        subject: payload.subject,
        html: payload.html,
      });

      this.logger.log(`[SendGrid] Email sent successfully to: ${payload.to}`);
    } catch (error) {
      this.logger.error(`[SendGrid] Failed to send email to ${payload.to}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

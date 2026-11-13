import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { BrevoEmailAdapter } from '../email/adapters/brevo.email.adapter';
import { EMAIL_ADAPTER_TOKEN } from '../email/adapters/email-adapter.interface';
import { MailgunEmailAdapter } from '../email/adapters/mailgun.email.adapter';
import { ResendEmailAdapter } from '../email/adapters/resend.email.adapter';
import { SendGridEmailAdapter } from '../email/adapters/sendgrid.email.adapter';

describe('Email Adapter Factory Provider', () => {
  const createTestingModuleForProvider = async (provider?: string) => {
    const mockSendGrid = { name: 'sendgrid' };
    const mockMailgun = { name: 'mailgun' };
    const mockBrevo = { name: 'brevo' };
    const mockResend = { name: 'resend' };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'EMAIL_PROVIDER') return provider;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SendGridEmailAdapter, useValue: mockSendGrid },
        { provide: MailgunEmailAdapter, useValue: mockMailgun },
        { provide: BrevoEmailAdapter, useValue: mockBrevo },
        { provide: ResendEmailAdapter, useValue: mockResend },
        {
          provide: EMAIL_ADAPTER_TOKEN,
          inject: [
            ConfigService,
            SendGridEmailAdapter,
            MailgunEmailAdapter,
            BrevoEmailAdapter,
            ResendEmailAdapter,
          ],
          useFactory: (
            config: ConfigService,
            sendGrid: SendGridEmailAdapter,
            mailgun: MailgunEmailAdapter,
            brevo: BrevoEmailAdapter,
            resend: ResendEmailAdapter,
          ) => {
            const resolvedProvider =
              config.get<string>('EMAIL_PROVIDER') ?? 'brevo';
            if (resolvedProvider === 'brevo') return brevo;
            if (resolvedProvider === 'sendgrid') return sendGrid;
            if (resolvedProvider === 'resend') return resend;
            return mailgun;
          },
        },
      ],
    }).compile();

    return module.get(EMAIL_ADAPTER_TOKEN);
  };

  it('should resolve ResendEmailAdapter when EMAIL_PROVIDER is resend', async () => {
    const adapter = await createTestingModuleForProvider('resend');
    expect(adapter).toEqual({ name: 'resend' });
  });

  it('should resolve BrevoEmailAdapter when EMAIL_PROVIDER is brevo', async () => {
    const adapter = await createTestingModuleForProvider('brevo');
    expect(adapter).toEqual({ name: 'brevo' });
  });

  it('should resolve SendGridEmailAdapter when EMAIL_PROVIDER is sendgrid', async () => {
    const adapter = await createTestingModuleForProvider('sendgrid');
    expect(adapter).toEqual({ name: 'sendgrid' });
  });

  it('should resolve MailgunEmailAdapter when EMAIL_PROVIDER is mailgun', async () => {
    const adapter = await createTestingModuleForProvider('mailgun');
    expect(adapter).toEqual({ name: 'mailgun' });
  });

  it('should default to BrevoEmailAdapter when EMAIL_PROVIDER is not specified', async () => {
    const adapter = await createTestingModuleForProvider(undefined);
    expect(adapter).toEqual({ name: 'brevo' });
  });
});

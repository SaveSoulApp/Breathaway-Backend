import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { BrevoEmailAdapter } from '@modules/notifications/email/adapters/brevo.email.adapter';
import { FailoverEmailAdapter } from '@modules/notifications/email/adapters/failover.email.adapter';
import { MailgunEmailAdapter } from '@modules/notifications/email/adapters/mailgun.email.adapter';
import { ResendEmailAdapter } from '@modules/notifications/email/adapters/resend.email.adapter';
import { SendGridEmailAdapter } from '@modules/notifications/email/adapters/sendgrid.email.adapter';

describe('FailoverEmailAdapter', () => {
  let adapter: FailoverEmailAdapter;
  let mockLogger: MockProxy<LoggerService>;
  let mockConfigService: MockProxy<ConfigService>;
  let mockResend: MockProxy<ResendEmailAdapter>;
  let mockBrevo: MockProxy<BrevoEmailAdapter>;
  let mockMailgun: MockProxy<MailgunEmailAdapter>;
  let mockSendGrid: MockProxy<SendGridEmailAdapter>;

  const samplePayload = {
    to: 'user@example.com',
    subject: 'Welcome',
    html: '<p>Welcome</p>',
  };

  const createAdapter = async (
    providersConfig?: string,
  ): Promise<FailoverEmailAdapter> => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'EMAIL_PROVIDERS') return providersConfig;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        FailoverEmailAdapter,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ResendEmailAdapter, useValue: mockResend },
        { provide: BrevoEmailAdapter, useValue: mockBrevo },
        { provide: MailgunEmailAdapter, useValue: mockMailgun },
        { provide: SendGridEmailAdapter, useValue: mockSendGrid },
      ],
    }).compile();

    return module.get<FailoverEmailAdapter>(FailoverEmailAdapter);
  };

  beforeEach(async () => {
    mockLogger = mockDeep<LoggerService>();
    mockConfigService = mockDeep<ConfigService>();
    mockResend = mockDeep<ResendEmailAdapter>();
    mockBrevo = mockDeep<BrevoEmailAdapter>();
    mockMailgun = mockDeep<MailgunEmailAdapter>();
    mockSendGrid = mockDeep<SendGridEmailAdapter>();

    const contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
      verbose: jest.fn(),
    };
    mockLogger.forContext.mockReturnValue(contextualLogger as never);

    adapter = await createAdapter('resend,brevo,mailgun');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should deliver via provider 1 (resend) when it succeeds without invoking fallbacks', async () => {
    mockResend.send.mockResolvedValueOnce();

    await adapter.send(samplePayload);

    expect(mockResend.send).toHaveBeenCalledWith(samplePayload);
    expect(mockBrevo.send).not.toHaveBeenCalled();
    expect(mockMailgun.send).not.toHaveBeenCalled();
  });

  it('should fallback to provider 2 (brevo) when provider 1 (resend) fails', async () => {
    mockResend.send.mockRejectedValueOnce(
      new Error('Resend rate limit exceeded'),
    );
    mockBrevo.send.mockResolvedValueOnce();

    await adapter.send(samplePayload);

    expect(mockResend.send).toHaveBeenCalledWith(samplePayload);
    expect(mockBrevo.send).toHaveBeenCalledWith(samplePayload);
    expect(mockMailgun.send).not.toHaveBeenCalled();
  });

  it('should cascade to provider 3 (mailgun) when both resend and brevo fail', async () => {
    mockResend.send.mockRejectedValueOnce(new Error('Resend network outage'));
    mockBrevo.send.mockRejectedValueOnce(new Error('Brevo quota exceeded'));
    mockMailgun.send.mockResolvedValueOnce();

    await adapter.send(samplePayload);

    expect(mockResend.send).toHaveBeenCalledWith(samplePayload);
    expect(mockBrevo.send).toHaveBeenCalledWith(samplePayload);
    expect(mockMailgun.send).toHaveBeenCalledWith(samplePayload);
  });

  it('should throw an aggregate error when all configured providers in the chain fail', async () => {
    mockResend.send.mockRejectedValueOnce(new Error('Resend 500 error'));
    mockBrevo.send.mockRejectedValueOnce(new Error('Brevo 502 error'));
    mockMailgun.send.mockRejectedValueOnce(new Error('Mailgun 503 error'));

    await expect(adapter.send(samplePayload)).rejects.toThrow(
      'All email providers failed in failover chain: [resend] Resend 500 error; [brevo] Brevo 502 error; [mailgun] Mailgun 503 error',
    );
  });

  it('should pre-resolve and cache custom priority order via EMAIL_PROVIDERS config at startup', async () => {
    const customAdapter = await createAdapter('brevo,resend,mailgun');
    mockBrevo.send.mockResolvedValueOnce();

    await customAdapter.send(samplePayload);

    expect(mockBrevo.send).toHaveBeenCalledWith(samplePayload);
    expect(mockResend.send).not.toHaveBeenCalled();
    expect(mockMailgun.send).not.toHaveBeenCalled();

    // Verify getter returns cached order
    expect(customAdapter.getOrderedAdapters().map((a) => a.name)).toEqual([
      'brevo',
      'resend',
      'mailgun',
    ]);
  });

  it('should fallback to default chain when EMAIL_PROVIDERS is not configured', async () => {
    const defaultAdapter = await createAdapter(undefined);
    mockResend.send.mockResolvedValueOnce();

    await defaultAdapter.send(samplePayload);

    expect(mockResend.send).toHaveBeenCalledWith(samplePayload);
    expect(mockBrevo.send).not.toHaveBeenCalled();
  });

  it('should filter out unsupported provider names and proceed with valid ones', async () => {
    const filteredAdapter = await createAdapter('nonexistent,mailgun');
    mockMailgun.send.mockResolvedValueOnce();

    await filteredAdapter.send(samplePayload);

    expect(mockMailgun.send).toHaveBeenCalledWith(samplePayload);
    expect(filteredAdapter.getOrderedAdapters().map((a) => a.name)).toEqual([
      'mailgun',
    ]);
  });

  it('should deduplicate provider names when duplicates are configured', async () => {
    const deduplicatedAdapter = await createAdapter(
      'resend,brevo,resend,brevo',
    );

    expect(deduplicatedAdapter.getOrderedAdapters().map((a) => a.name)).toEqual(
      ['resend', 'brevo'],
    );
  });

  it('should default to resend if no valid providers are found in config', async () => {
    const emptyAdapter = await createAdapter('nonexistent,another_invalid');
    mockResend.send.mockResolvedValueOnce();

    await emptyAdapter.send(samplePayload);

    expect(mockResend.send).toHaveBeenCalledWith(samplePayload);
    expect(emptyAdapter.getOrderedAdapters().map((a) => a.name)).toEqual([
      'resend',
    ]);
  });
});

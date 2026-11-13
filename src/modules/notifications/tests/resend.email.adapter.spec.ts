import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { HttpClientService } from '@infrastructure/http';
import { ResendEmailAdapter } from '@modules/notifications/email/adapters/resend.email.adapter';

describe('ResendEmailAdapter', () => {
  let adapter: ResendEmailAdapter;
  let mockLogger: MockProxy<LoggerService>;
  let mockConfigService: MockProxy<ConfigService>;
  const mockHttpClient = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    mockLogger = mockDeep<LoggerService>();
    mockConfigService = mockDeep<ConfigService>();

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

    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'RESEND_API_KEY':
          return 'test-resend-api-key';
        case 'EMAIL_FROM_ADDRESS':
          return 'no-reply@breathaway.com';
        case 'EMAIL_FROM_NAME':
          return 'BreathAway';
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ResendEmailAdapter,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpClientService, useValue: mockHttpClient },
      ],
    }).compile();

    adapter = module.get<ResendEmailAdapter>(ResendEmailAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should log warning when RESEND_API_KEY or EMAIL_FROM_ADDRESS is missing', async () => {
      const emptyConfigService = mockDeep<ConfigService>();
      emptyConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          ResendEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: emptyConfigService },
          { provide: HttpClientService, useValue: mockHttpClient },
        ],
      }).compile();

      const warnAdapter = module.get<ResendEmailAdapter>(ResendEmailAdapter);
      expect(warnAdapter).toBeDefined();
    });
  });

  describe('send', () => {
    it('should successfully post email payload to Resend endpoint with correct headers and body', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        status: 200,
        data: { id: 'email_12345' },
      });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Welcome to BreathAway',
        html: '<h1>Welcome!</h1>',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        {
          from: 'BreathAway <no-reply@breathaway.com>',
          to: ['user@example.com'],
          subject: 'Welcome to BreathAway',
          html: '<h1>Welcome!</h1>',
        },
        {
          headers: {
            Authorization: 'Bearer test-resend-api-key',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
    });

    it('should use custom sender from payload if provided', async () => {
      mockHttpClient.post.mockResolvedValueOnce({ status: 200, data: {} });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Alert',
        html: '<p>Alert</p>',
        from: 'alerts@breathaway.com',
        fromName: 'BreathAway Alerts',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          from: 'BreathAway Alerts <alerts@breathaway.com>',
        }),
        expect.anything(),
      );
    });

    it('should format sender with default fromName when custom from is provided without fromName', async () => {
      mockHttpClient.post.mockResolvedValueOnce({ status: 200, data: {} });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Alert',
        html: '<p>Alert</p>',
        from: 'custom@breathaway.com',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          from: 'BreathAway <custom@breathaway.com>',
        }),
        expect.anything(),
      );
    });

    it('should throw an error when recipient email is missing', async () => {
      await expect(
        adapter.send({
          to: '',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Resend] Cannot send email: recipient address is missing',
      );

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should throw an error when API key is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return '';
        if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@breathaway.com';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          ResendEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: HttpClientService, useValue: mockHttpClient },
        ],
      }).compile();

      const noKeyAdapter = module.get<ResendEmailAdapter>(ResendEmailAdapter);

      await expect(
        noKeyAdapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Resend] Cannot send email: RESEND_API_KEY is not configured',
      );
    });

    it('should throw an error when sender email is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 'valid-key';
        if (key === 'EMAIL_FROM_ADDRESS') return '';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          ResendEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: HttpClientService, useValue: mockHttpClient },
        ],
      }).compile();

      const noSenderAdapter =
        module.get<ResendEmailAdapter>(ResendEmailAdapter);

      await expect(
        noSenderAdapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Resend] Cannot send email: sender address is missing. Configure EMAIL_FROM_ADDRESS.',
      );
    });

    it('should propagate delivery errors when Resend API rejects the request', async () => {
      mockHttpClient.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        adapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow('Email delivery failed: Network error');
    });
  });
});

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { BrevoEmailAdapter } from '@modules/notifications/email/adapters/brevo.email.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BrevoEmailAdapter', () => {
  let adapter: BrevoEmailAdapter;
  let mockLogger: MockProxy<LoggerService>;
  let mockConfigService: MockProxy<ConfigService>;

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
        case 'BREVO_API_KEY':
          return 'test-brevo-api-key';
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
        BrevoEmailAdapter,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<BrevoEmailAdapter>(BrevoEmailAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should successfully post email payload to Brevo v3 endpoint with correct headers and body', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 201,
        data: { messageId: '<test-msg-id@brevo>' },
      });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Welcome to BreathAway',
        html: '<h1>Welcome!</h1>',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: {
            email: 'no-reply@breathaway.com',
            name: 'BreathAway',
          },
          to: [{ email: 'user@example.com' }],
          subject: 'Welcome to BreathAway',
          htmlContent: '<h1>Welcome!</h1>',
        },
        {
          headers: {
            'api-key': 'test-brevo-api-key',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
    });

    it('should use custom sender from payload if provided', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 201, data: {} });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Alert',
        html: '<p>Alert</p>',
        from: 'alerts@breathaway.com',
        fromName: 'BreathAway Alerts',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          sender: {
            email: 'alerts@breathaway.com',
            name: 'BreathAway Alerts',
          },
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
        '[Brevo] Cannot send email: recipient address is missing',
      );

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should throw an error when API key is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return '';
        if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@breathaway.com';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          BrevoEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const noKeyAdapter = module.get<BrevoEmailAdapter>(BrevoEmailAdapter);

      await expect(
        noKeyAdapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Brevo] Cannot send email: BREVO_API_KEY is not configured',
      );
    });

    it('should throw an error when sender email is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BREVO_API_KEY') return 'valid-key';
        if (key === 'EMAIL_FROM_ADDRESS') return '';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          BrevoEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const noSenderAdapter = module.get<BrevoEmailAdapter>(BrevoEmailAdapter);

      await expect(
        noSenderAdapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Brevo] Cannot send email: sender address is missing. Configure EMAIL_FROM_ADDRESS.',
      );
    });

    it('should propagate delivery errors when Brevo API rejects the request', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

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

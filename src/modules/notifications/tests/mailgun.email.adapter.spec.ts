import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { MailgunEmailAdapter } from '@modules/notifications/email/adapters/mailgun.email.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MailgunEmailAdapter', () => {
  let adapter: MailgunEmailAdapter;
  let mockLogger: MockProxy<LoggerService>;
  let mockConfigService: MockProxy<ConfigService>;
  let contextualLogger: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockLogger = mockDeep<LoggerService>();
    mockConfigService = mockDeep<ConfigService>();

    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      event: jest.fn(),
    };
    mockLogger.forContext.mockReturnValue(contextualLogger as never);

    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'MAILGUN_API_KEY':
          return 'test-mailgun-api-key';
        case 'MAILGUN_DOMAIN':
          return 'mg.breathaway.com';
        case 'MAILGUN_HOST':
          return 'api.mailgun.net';
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
        MailgunEmailAdapter,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<MailgunEmailAdapter>(MailgunEmailAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor warnings', () => {
    it('should warn when MAILGUN_API_KEY, MAILGUN_DOMAIN, or EMAIL_FROM_ADDRESS is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          MailgunEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      module.get<MailgunEmailAdapter>(MailgunEmailAdapter);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'MAILGUN_API_KEY is not configured — Mailgun adapter will fail at send time',
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'MAILGUN_DOMAIN is not configured — Mailgun adapter will fail at send time',
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'EMAIL_FROM_ADDRESS is not configured — Mailgun adapter will fall back to an empty sender',
      );
    });
  });

  describe('send', () => {
    it('should send email using axios with form data and basic auth', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { id: '<mailgun-id>' },
      });

      await adapter.send({
        to: 'user@example.com',
        subject: 'Welcome',
        html: '<p>Welcome!</p>',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/mg.breathaway.com/messages',
        expect.anything(),
        expect.objectContaining({
          auth: {
            username: 'api',
            password: 'test-mailgun-api-key',
          },
        }),
      );
      expect(contextualLogger.log).toHaveBeenCalledWith(
        'Email sent successfully',
        expect.objectContaining({ provider: 'mailgun', step: 'complete' }),
      );
    });

    it('should throw when recipient to is missing', async () => {
      await expect(
        adapter.send({
          to: '',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow(
        '[Mailgun] Cannot send email: recipient address is missing',
      );

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should throw when html body is missing', async () => {
      await expect(
        adapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '',
        }),
      ).rejects.toThrow(
        '[Mailgun] Cannot send email: html body is missing or empty',
      );

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should log and rethrow delivery error when axios post fails', async () => {
      const networkError = new Error('Mailgun connection refused');
      mockedAxios.post.mockRejectedValueOnce(networkError);

      await expect(
        adapter.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        }),
      ).rejects.toThrow('Email delivery failed: Mailgun connection refused');

      expect(contextualLogger.error).toHaveBeenCalledWith(
        'Email send failed',
        expect.objectContaining({
          provider: 'mailgun',
          step: 'send',
        }),
      );
    });
  });
});

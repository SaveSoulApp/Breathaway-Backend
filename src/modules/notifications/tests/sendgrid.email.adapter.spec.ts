import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import SendGrid from '@sendgrid/mail';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { SendGridEmailAdapter } from '@modules/notifications/email/adapters/sendgrid.email.adapter';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('SendGridEmailAdapter', () => {
  let adapter: SendGridEmailAdapter;
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
        case 'SENDGRID_API_KEY':
          return 'SG.test-api-key';
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
        SendGridEmailAdapter,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<SendGridEmailAdapter>(SendGridEmailAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should set SendGrid API key when configured', () => {
      expect(SendGrid.setApiKey).toHaveBeenCalledWith('SG.test-api-key');
    });

    it('should log warning when SENDGRID_API_KEY is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: ClsService, useValue: { get: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          SendGridEmailAdapter,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      module.get<SendGridEmailAdapter>(SendGridEmailAdapter);

      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'SENDGRID_API_KEY is not configured — SendGrid adapter will fail at send time',
      );
    });
  });

  describe('send', () => {
    it('should send email successfully with SendGrid.send', async () => {
      (SendGrid.send as jest.Mock).mockResolvedValueOnce([{}]);

      await adapter.send({
        to: 'recipient@example.com',
        subject: 'Hello',
        html: '<p>Hello world</p>',
      });

      expect(SendGrid.send).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: {
          email: 'no-reply@breathaway.com',
          name: 'BreathAway',
        },
        subject: 'Hello',
        html: '<p>Hello world</p>',
      });
      expect(contextualLogger.log).toHaveBeenCalledWith(
        '[SendGrid] Email sent successfully to: recipient@example.com',
      );
    });

    it('should log error and rethrow when SendGrid.send fails', async () => {
      const error = new Error('SendGrid API quota exceeded');
      (SendGrid.send as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        adapter.send({
          to: 'recipient@example.com',
          subject: 'Hello',
          html: '<p>Hello world</p>',
        }),
      ).rejects.toThrow(error);

      expect(contextualLogger.error).toHaveBeenCalledWith(
        '[SendGrid] Failed to send email to recipient@example.com:',
        expect.objectContaining({ error: 'SendGrid API quota exceeded' }),
      );
    });
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep, MockProxy } from 'jest-mock-extended';
import * as fs from 'fs';

import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  EmailService,
  SendEmailOptions,
} from '@modules/notifications/email/email.service';
import {
  IEmailAdapter,
  EMAIL_ADAPTER_TOKEN,
} from '@modules/notifications/email/adapters/email-adapter.interface';
import { EmailType } from '@modules/notifications/enums/email-type.enum';
import { EMAIL_TEMPLATE_MAP } from '@modules/notifications/email/email-template.registry';
import { ClsService } from 'nestjs-cls';

// Mock fs to avoid actual file reads in unit tests
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('EmailService', () => {
  let service: EmailService;
  let mockPrisma: DeepMockProxy<PrismaService>;
  let mockAdapter: MockProxy<IEmailAdapter>;
  let mockLogger: MockProxy<LoggerService>;

  const STUB_TEMPLATE = '<p>Hello {{name}}</p>';
  const STUB_LAYOUT = '<!DOCTYPE html><html><body>{{{body}}}</body></html>';

  beforeEach(async () => {
    mockPrisma = mockDeep<PrismaService>();
    mockAdapter = mockDeep<IEmailAdapter>();
    mockLogger = mockDeep<LoggerService>();
    const contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
    mockLogger.forContext.mockReturnValue(contextualLogger as never);

    // Stub fs.existsSync + fs.readdirSync + fs.readFileSync
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof fs.readdirSync>,
    );
    mockFs.readFileSync.mockImplementation((filePath: unknown) => {
      const fp = String(filePath);
      if (fp.includes('layout.hbs')) return STUB_LAYOUT;
      return STUB_TEMPLATE;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        EmailService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EMAIL_ADAPTER_TOKEN, useValue: mockAdapter },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should resolve emails from DB and call adapter for each recipient', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', valueMasked: 'alice@example.com' },
        { userId: 'user-2', valueMasked: 'bob@example.com' },
      ] as never);
      mockAdapter.send.mockResolvedValue(undefined);

      const options: SendEmailOptions = {
        emailType: EmailType.WELCOME,
        userIds: ['user-1', 'user-2'],
        templateData: {
          name: 'Alice',
          appUrl: 'https://app.breathaway.com',
          currentYear: 2026,
        },
      };

      await service.send(options);

      expect(mockPrisma.authCredential.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { in: ['user-1', 'user-2'] },
          }),
        }),
      );
      expect(mockAdapter.send).toHaveBeenCalledTimes(2);
    });

    it('should skip sending if no userIds are provided', async () => {
      await service.send({
        emailType: EmailType.WELCOME,
        userIds: [],
        templateData: {},
      });

      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
      expect(mockAdapter.send).not.toHaveBeenCalled();
    });

    it('should skip sending if no valid email addresses are resolved', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', valueMasked: null },
      ] as never);

      await service.send({
        emailType: EmailType.WELCOME,
        userIds: ['user-1'],
        templateData: { name: 'Ghost' },
      });

      expect(mockAdapter.send).not.toHaveBeenCalled();
    });

    it('should continue sending to remaining recipients if one adapter call fails', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', valueMasked: 'alice@example.com' },
        { userId: 'user-2', valueMasked: 'bob@example.com' },
      ] as never);
      mockAdapter.send
        .mockRejectedValueOnce(new Error('delivery failure'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.send({
          emailType: EmailType.WELCOME,
          userIds: ['user-1', 'user-2'],
          templateData: { name: 'Test', appUrl: '', currentYear: 2026 },
        }),
      ).resolves.not.toThrow();

      expect(mockAdapter.send).toHaveBeenCalledTimes(2);
    });

    it('should render the subject using Handlebars with templateData', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', valueMasked: 'test@example.com' },
      ] as never);
      mockAdapter.send.mockResolvedValue(undefined);

      await service.send({
        emailType: EmailType.WELCOME,
        userIds: ['user-1'],
        templateData: { name: 'Mohit', appUrl: '', currentYear: 2026 },
      });

      const callArgs = mockAdapter.send.mock.calls[0][0];
      expect(callArgs.subject).toContain('Mohit');
      expect(callArgs.to).toBe('test@example.com');
    });
  });

  describe('EMAIL_TEMPLATE_MAP', () => {
    it('should have a registry entry for every EmailType value', () => {
      const allEmailTypes = Object.values(EmailType);
      allEmailTypes.forEach((emailType) => {
        expect(EMAIL_TEMPLATE_MAP[emailType]).toBeDefined();
        expect(EMAIL_TEMPLATE_MAP[emailType].templateFile).toBeTruthy();
        expect(EMAIL_TEMPLATE_MAP[emailType].subject).toBeTruthy();
      });
    });
  });
});

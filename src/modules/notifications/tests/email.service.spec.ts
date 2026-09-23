import * as fs from 'fs';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep, MockProxy } from 'jest-mock-extended';
import { ClsService } from 'nestjs-cls';

import { IdentityCryptoService } from '@core/identity-crypto/identity-crypto.service';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  EMAIL_ADAPTER_TOKEN,
  IEmailAdapter,
} from '@modules/notifications/email/adapters/email-adapter.interface';
import { EMAIL_TEMPLATE_MAP } from '@modules/notifications/email/email-template.registry';
import {
  EmailService,
  SendEmailOptions,
} from '@modules/notifications/email/email.service';
import { EmailType } from '@modules/notifications/enums/email-type.enum';

// Mock fs to avoid actual file reads in unit tests
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('EmailService', () => {
  let service: EmailService;
  let mockPrisma: DeepMockProxy<PrismaService>;
  let mockIdentityCrypto: DeepMockProxy<IdentityCryptoService>;
  let mockAdapter: MockProxy<IEmailAdapter>;
  let mockLogger: MockProxy<LoggerService>;

  const STUB_TEMPLATE = '<p>Hello {{name}}</p>';
  const STUB_LAYOUT = '<!DOCTYPE html><html><body>{{{body}}}</body></html>';

  const fakeIdentity1 = {
    publicValueCiphertext: 'cipher-1',
    publicValueIv: 'iv-1',
    publicValueTag: 'tag-1',
    publicValueWrappedKey: 'key-1',
    publicValueKeyId: 'kid-1',
  };

  const fakeIdentity2 = {
    publicValueCiphertext: 'cipher-2',
    publicValueIv: 'iv-2',
    publicValueTag: 'tag-2',
    publicValueWrappedKey: 'key-2',
    publicValueKeyId: 'kid-2',
  };

  beforeEach(async () => {
    mockPrisma = mockDeep<PrismaService>();
    mockIdentityCrypto = mockDeep<IdentityCryptoService>();
    mockAdapter = mockDeep<IEmailAdapter>();
    mockLogger = mockDeep<LoggerService>();
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
        { provide: IdentityCryptoService, useValue: mockIdentityCrypto },
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
    it('should resolve and decrypt emails from DB and call adapter for each recipient', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', identity: fakeIdentity1 },
        { userId: 'user-2', identity: fakeIdentity2 },
      ] as never);

      mockIdentityCrypto.decryptPublicValue
        .mockResolvedValueOnce('alice@example.com')
        .mockResolvedValueOnce('bob@example.com');

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
      expect(mockIdentityCrypto.decryptPublicValue).toHaveBeenCalledTimes(2);
      expect(mockAdapter.send).toHaveBeenCalledTimes(2);
    });

    it('should skip sending if no userIds are provided', async () => {
      await service.send({
        emailType: EmailType.WELCOME,
        userIds: [],
        templateData: {},
      });

      expect(mockPrisma.authCredential.findMany).not.toHaveBeenCalled();
      expect(mockIdentityCrypto.decryptPublicValue).not.toHaveBeenCalled();
      expect(mockAdapter.send).not.toHaveBeenCalled();
    });

    it('should skip sending if no valid email addresses are resolved or decrypted', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', identity: null },
      ] as never);

      await service.send({
        emailType: EmailType.WELCOME,
        userIds: ['user-1'],
        templateData: { name: 'Ghost' },
      });

      expect(mockIdentityCrypto.decryptPublicValue).not.toHaveBeenCalled();
      expect(mockAdapter.send).not.toHaveBeenCalled();
    });

    it('should continue sending to remaining recipients if one decryption fails', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', identity: fakeIdentity1 },
        { userId: 'user-2', identity: fakeIdentity2 },
      ] as never);

      mockIdentityCrypto.decryptPublicValue
        .mockRejectedValueOnce(new Error('KMS unwrap error'))
        .mockResolvedValueOnce('bob@example.com');

      mockAdapter.send.mockResolvedValue(undefined);

      await service.send({
        emailType: EmailType.WELCOME,
        userIds: ['user-1', 'user-2'],
        templateData: { name: 'Test', appUrl: '', currentYear: 2026 },
      });

      expect(mockAdapter.send).toHaveBeenCalledTimes(1);
      expect(mockAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'bob@example.com' }),
      );
    });

    it('should deduplicate recipients if multiple credentials decrypt to the same email', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', identity: fakeIdentity1 },
        { userId: 'user-2', identity: fakeIdentity2 },
      ] as never);

      mockIdentityCrypto.decryptPublicValue
        .mockResolvedValueOnce('ALICE@EXAMPLE.COM')
        .mockResolvedValueOnce('alice@example.com');

      mockAdapter.send.mockResolvedValue(undefined);

      await service.send({
        emailType: EmailType.WELCOME,
        userIds: ['user-1', 'user-2'],
        templateData: { name: 'Alice', appUrl: '', currentYear: 2026 },
      });

      expect(mockAdapter.send).toHaveBeenCalledTimes(1);
      expect(mockAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'alice@example.com' }),
      );
    });

    it('should continue sending to remaining recipients if one adapter call fails', async () => {
      mockPrisma.authCredential.findMany.mockResolvedValue([
        { userId: 'user-1', identity: fakeIdentity1 },
        { userId: 'user-2', identity: fakeIdentity2 },
      ] as never);

      mockIdentityCrypto.decryptPublicValue
        .mockResolvedValueOnce('alice@example.com')
        .mockResolvedValueOnce('bob@example.com');

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
        { userId: 'user-1', identity: fakeIdentity1 },
      ] as never);

      mockIdentityCrypto.decryptPublicValue.mockResolvedValueOnce(
        'test@example.com',
      );
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

    it('should compile and render all template files on disk without syntax errors', () => {
      const realFs = jest.requireActual('fs') as typeof import('fs');
      const realPath = jest.requireActual('path') as typeof import('path');
      const HandlebarsActual = jest.requireActual(
        'handlebars',
      ) as typeof import('handlebars');

      // Register helpers
      HandlebarsActual.registerHelper(
        'gt',
        (a: unknown, b: unknown) => Number(a) > Number(b),
      );
      HandlebarsActual.registerHelper(
        'gte',
        (a: unknown, b: unknown) => Number(a) >= Number(b),
      );
      HandlebarsActual.registerHelper(
        'lt',
        (a: unknown, b: unknown) => Number(a) < Number(b),
      );
      HandlebarsActual.registerHelper(
        'lte',
        (a: unknown, b: unknown) => Number(a) <= Number(b),
      );
      HandlebarsActual.registerHelper(
        'eq',
        (a: unknown, b: unknown) => a === b,
      );

      const templatesDir = realPath.resolve(__dirname, '../templates');
      const partialsDir = realPath.join(templatesDir, 'partials');
      if (realFs.existsSync(partialsDir)) {
        for (const file of realFs.readdirSync(partialsDir)) {
          if (file.endsWith('.hbs')) {
            const name = realPath.basename(file, '.hbs');
            HandlebarsActual.registerPartial(
              name,
              realFs.readFileSync(realPath.join(partialsDir, file), 'utf-8'),
            );
          }
        }
      }

      const layoutSource = realFs.readFileSync(
        realPath.join(templatesDir, 'layout.hbs'),
        'utf-8',
      );
      const layoutDelegate = HandlebarsActual.compile(layoutSource);

      const samplePayloads: Record<string, Record<string, unknown>> = {
        [EmailType.WELCOME]: { name: 'Alice', ctaUrl: 'https://example.com' },
        [EmailType.LIKE_SENT]: {
          name: 'Alice',
          targetMaskedValue: '+1 555 ••• ••89',
          targetLabel: 'Bob',
          intent: 'CRUSH',
          expiresAt: '2026-12-31',
        },
        [EmailType.NEW_MATCH]: {
          name: 'Alice',
          matchName: 'Bob',
          matchAvatarUrl: 'https://example.com/avatar.jpg',
          chatUrl: 'https://example.com/chat',
        },
        [EmailType.NEW_MESSAGE]: { senderName: 'Bob', messagePreview: 'Hey!' },
        [EmailType.CREDIT_UPDATE]: {
          name: 'Alice',
          creditChange: 10,
          creditBalance: 20,
        },
        [EmailType.CREDITS_PURCHASED]: {
          name: 'Alice',
          creditsAdded: 50,
          creditBalance: 100,
          transactionId: 'tx-123',
          expiresAt: '2027-01-01',
        },
        [EmailType.SYSTEM_ALERT]: { alertTitle: 'Alert', alertBody: 'Notice' },
        [EmailType.BUNDLE_EXPIRY_WARNING]: {
          name: 'Alice',
          count: 5,
          expiryDate: '2026-10-01',
          daysRemaining: 7,
          isUrgent: false,
        },
        [EmailType.LIKES_EXPIRED]: {
          name: 'Alice',
          count: 3,
          expiryDate: '2026-09-01',
        },
        [EmailType.IDENTITY_ADDED]: {
          name: 'Alice',
          identityType: 'Email',
          maskedValue: 'a••••e@gmail.com',
          addedAt: '2026-09-23 12:00 UTC',
          isVerified: true,
        },
        [EmailType.IDENTITY_REMOVED]: {
          name: 'Alice',
          identityType: 'Email',
          maskedValue: 'a••••e@gmail.com',
          removedAt: '2026-09-23 12:00 UTC',
        },
        [EmailType.CREDITS_USED]: {
          name: 'Alice',
          creditsUsed: 1,
          creditBalance: 19,
          usedAt: '2026-09-23 12:00 UTC',
        },
        [EmailType.DEVICE_ADDED]: {
          name: 'Alice',
          platform: 'IOS',
          deviceId: 'iPhone15,2',
          appVersion: '1.2.0',
          addedAt: '2026-09-23 12:00 UTC',
        },
        [EmailType.LIKE_WITHDRAWN]: {
          name: 'Alice',
          targetMaskedValue: '+1 555 ••• ••89',
          targetLabel: 'Bob',
          withdrawnAt: '2026-09-23 12:00 UTC',
        },
      };

      for (const emailType of Object.values(EmailType)) {
        const config = EMAIL_TEMPLATE_MAP[emailType];
        const templatePath = realPath.join(
          templatesDir,
          `${config.templateFile}.hbs`,
        );
        expect(realFs.existsSync(templatePath)).toBe(true);

        const templateSource = realFs.readFileSync(templatePath, 'utf-8');
        expect(() => {
          const compiled = HandlebarsActual.compile(templateSource);
          const payload = samplePayloads[emailType] ?? { name: 'Test' };
          const content = compiled(payload);
          layoutDelegate({ ...payload, body: content });
        }).not.toThrow();
      }
    });
  });
});

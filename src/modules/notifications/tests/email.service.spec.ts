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
  });
});

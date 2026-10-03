import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { LiteAppWhatsAppAdapter } from '../../whatsapp/adapters/liteapp.whatsapp.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LiteAppWhatsAppAdapter', () => {
  let adapter: LiteAppWhatsAppAdapter;
  let configService: ConfigService;

  const mockLogger = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    }),
  };

  const setupModule = async (envConfig: Record<string, string | undefined>) => {
    mockedAxios.isAxiosError.mockImplementation(
      (err: unknown) =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiteAppWhatsAppAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => envConfig[key]),
          },
        },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    adapter = module.get<LiteAppWhatsAppAdapter>(LiteAppWhatsAppAdapter);
    configService = module.get<ConfigService>(ConfigService);
  };

  beforeEach(() => {
    mockedAxios.isAxiosError.mockImplementation(
      (err: unknown) =>
        (err as { isAxiosError?: boolean })?.isAxiosError === true,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should throw an error when LITEAPP_WHATSAPP_KEY is missing', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: undefined,
      });

      await expect(
        adapter.send({
          to: '919876543210',
          template: 'breathaway_new_match',
        }),
      ).rejects.toThrow('LITEAPP_WHATSAPP_KEY is not configured');
    });

    it('should throw an error when recipient phone is missing', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      await expect(
        adapter.send({
          to: '',
          template: 'breathaway_new_match',
        }),
      ).rejects.toThrow('recipient phone number is missing');
    });

    it('should successfully post to LiteApp API and never retry on 200 OK', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await adapter.send({
        to: '919876543210',
        template: 'breathaway_new_match',
        language: 'en',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://dev.liteapp.store/api/routes/plugins/whatsapp/send',
        {
          to: '919876543210',
          template: 'breathaway_new_match',
          language: 'en',
        },
        {
          headers: {
            Authorization: 'Bearer test-secret-key',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
    });

    it('should include optional params in payload when provided', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      await adapter.send({
        to: '919876543210',
        template: 'breathaway_like_sent',
        language: 'en',
        params: { buttonUrlVariable: 'alerts' },
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://dev.liteapp.store/api/routes/plugins/whatsapp/send',
        {
          to: '919876543210',
          template: 'breathaway_like_sent',
          language: 'en',
          buttonUrlVariable: 'alerts',
        },
        expect.any(Object),
      );
    });

    it('should retry once when receiving HTTP 429 with Retry-After header', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      const rateLimitError = {
        isAxiosError: true,
        response: {
          status: 429,
          headers: { 'retry-after': '0' },
          data: { error: 'Too many requests' },
        },
      };

      mockedAxios.post
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ status: 200, data: { success: true } });

      await adapter.send({
        to: '919876543210',
        template: 'breathaway_new_match',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should retry once when receiving HTTP 429 with title-cased Retry-After header or header getter', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      const rateLimitErrorTitleCase = {
        isAxiosError: true,
        response: {
          status: 429,
          headers: { 'Retry-After': '0' },
          data: { error: 'Too many requests' },
        },
      };

      mockedAxios.post
        .mockRejectedValueOnce(rateLimitErrorTitleCase)
        .mockResolvedValueOnce({ status: 200, data: { success: true } });

      await adapter.send({
        to: '919876543210',
        template: 'breathaway_new_match',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      const rateLimitErrorGetter = {
        isAxiosError: true,
        response: {
          status: 429,
          headers: {
            get: (key: string) => (key === 'retry-after' ? '0' : undefined),
          },
          data: { error: 'Too many requests' },
        },
      };

      mockedAxios.post
        .mockRejectedValueOnce(rateLimitErrorGetter)
        .mockResolvedValueOnce({ status: 200, data: { success: true } });

      await adapter.send({
        to: '919876543210',
        template: 'breathaway_new_match',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    });

    it('should fail and not retry further when retry after 429 also fails', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      const rateLimitError = {
        isAxiosError: true,
        response: {
          status: 429,
          headers: { 'retry-after': '0' },
          data: { error: 'Too many requests' },
        },
      };

      mockedAxios.post
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError);

      await expect(
        adapter.send({
          to: '919876543210',
          template: 'breathaway_new_match',
        }),
      ).rejects.toThrow('LiteApp WhatsApp delivery failed on retry');

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should log and not retry for non-429 HTTP errors (e.g., 400, 500)', async () => {
      await setupModule({
        LITEAPP_WHATSAPP_URL: 'https://dev.liteapp.store',
        LITEAPP_WHATSAPP_KEY: 'test-secret-key',
      });

      const badRequestError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Template not approved by Meta' },
        },
      };

      mockedAxios.post.mockRejectedValueOnce(badRequestError);

      await expect(
        adapter.send({
          to: '919876543210',
          template: 'breathaway_new_match',
        }),
      ).rejects.toThrow('LiteApp WhatsApp delivery failed');

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});

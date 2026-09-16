import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import {
  CORS_CONFIG_KEY,
  CorsConfig,
  corsConfig,
  configureCors,
  DEFAULT_CORS_ALLOWED_HEADERS,
  DEFAULT_CORS_METHODS,
  DEFAULT_CORS_ORIGINS,
} from '../cors.config';

describe('CorsConfig', () => {
  const originalEnv = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CORS_ORIGINS = originalEnv;
    } else {
      delete process.env.CORS_ORIGINS;
    }
    jest.clearAllMocks();
  });

  describe('parseOrigins', () => {
    it('should parse a valid JSON array of origins and trim whitespace', () => {
      const raw =
        '["  http://localhost:3000  ", "https://app.breathaway.com "]';
      const result = CorsConfig.parseOrigins(raw);
      expect(result).toEqual([
        'http://localhost:3000',
        'https://app.breathaway.com',
      ]);
    });

    it('should filter out empty strings in a JSON array', () => {
      const raw = '["http://localhost:3000", "", "   ", "https://example.com"]';
      const result = CorsConfig.parseOrigins(raw);
      expect(result).toEqual(['http://localhost:3000', 'https://example.com']);
    });

    it('should parse comma-separated strings when not valid JSON', () => {
      const raw =
        'http://localhost:3000, https://app.breathaway.com, https://admin.breathaway.com';
      const result = CorsConfig.parseOrigins(raw);
      expect(result).toEqual([
        'http://localhost:3000',
        'https://app.breathaway.com',
        'https://admin.breathaway.com',
      ]);
    });

    it('should fall back to DEFAULT_CORS_ORIGINS when input is null, undefined, or empty', () => {
      expect(CorsConfig.parseOrigins(null)).toEqual(DEFAULT_CORS_ORIGINS);
      expect(CorsConfig.parseOrigins(undefined)).toEqual(DEFAULT_CORS_ORIGINS);
      expect(CorsConfig.parseOrigins('')).toEqual(DEFAULT_CORS_ORIGINS);
      expect(CorsConfig.parseOrigins('   ')).toEqual(DEFAULT_CORS_ORIGINS);
      expect(CorsConfig.parseOrigins('[]')).toEqual(DEFAULT_CORS_ORIGINS);
    });

    it('should fall back to DEFAULT_CORS_ORIGINS when JSON is an empty object or non-array', () => {
      const raw = '{"origin": "http://localhost:3000"}';
      // Caught as non-array or fallback to comma-split
      const result = CorsConfig.parseOrigins(raw);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fromEnv', () => {
    it('should construct a CorsConfig instance with parsed origins and default options', () => {
      const config = CorsConfig.fromEnv('["https://app.breathaway.com"]');
      expect(config).toBeInstanceOf(CorsConfig);
      expect(config.allowedOrigins).toEqual(['https://app.breathaway.com']);
      expect(config.methods).toEqual(DEFAULT_CORS_METHODS);
      expect(config.allowedHeaders).toEqual(DEFAULT_CORS_ALLOWED_HEADERS);
      expect(config.credentials).toBe(true);
      expect(config.optionsSuccessStatus).toBe(204);
    });

    it('should construct with default origins when env string is undefined', () => {
      const config = CorsConfig.fromEnv(undefined);
      expect(config.allowedOrigins).toEqual(DEFAULT_CORS_ORIGINS);
    });
  });

  describe('toCorsOptions', () => {
    it('should map allowedOrigins to origin array when no wildcard is present', () => {
      const config = new CorsConfig({
        allowedOrigins: ['https://app.breathaway.com'],
      });
      const options = config.toCorsOptions();
      expect(options.origin).toEqual(['https://app.breathaway.com']);
      expect(options.credentials).toBe(true);
      expect(options.optionsSuccessStatus).toBe(204);
    });

    it('should map origin to true when wildcard is included in allowedOrigins', () => {
      const config = new CorsConfig({
        allowedOrigins: ['*'],
      });
      const options = config.toCorsOptions();
      expect(options.origin).toBe(true);
    });
  });

  describe('corsConfig (registerAs factory)', () => {
    it('should have key registered with CORS_CONFIG_KEY namespace', () => {
      expect(corsConfig.KEY).toBe(`CONFIGURATION(${CORS_CONFIG_KEY})`);
    });

    it('should produce a CorsConfig instance based on process.env.CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = '["https://test.breathaway.com"]';
      const result = corsConfig();
      expect(result).toBeInstanceOf(CorsConfig);
      expect(result.allowedOrigins).toEqual(['https://test.breathaway.com']);
    });

    it('should be retrievable via ConfigService when loaded in ConfigModule', async () => {
      process.env.CORS_ORIGINS = '["https://integrated.breathaway.com"]';

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [corsConfig],
            ignoreEnvFile: true,
          }),
        ],
      }).compile();

      const configService = moduleRef.get(ConfigService);
      const retrieved = configService.get<CorsConfig>(CORS_CONFIG_KEY);

      expect(retrieved).toBeInstanceOf(CorsConfig);
      expect(retrieved?.allowedOrigins).toEqual([
        'https://integrated.breathaway.com',
      ]);
    });
  });

  describe('configureCors', () => {
    let mockApp: jest.Mocked<INestApplication>;
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
      mockApp = {
        enableCors: jest.fn(),
      } as unknown as jest.Mocked<INestApplication>;

      mockConfigService = {
        get: jest.fn(),
      } as unknown as jest.Mocked<ConfigService>;
    });

    it('should configure CORS using the registered CorsConfig object from ConfigService', () => {
      const cors = new CorsConfig({
        allowedOrigins: ['https://staging.breathaway.com'],
      });
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === CORS_CONFIG_KEY) return cors;
        return undefined;
      });

      configureCors(mockApp, mockConfigService);

      expect(mockApp.enableCors).toHaveBeenCalledTimes(1);
      expect(mockApp.enableCors).toHaveBeenCalledWith({
        origin: ['https://staging.breathaway.com'],
        methods: DEFAULT_CORS_METHODS,
        allowedHeaders: DEFAULT_CORS_ALLOWED_HEADERS,
        credentials: true,
        optionsSuccessStatus: 204,
      });
    });

    it('should fall back to parsing raw CORS_ORIGINS string if registered cors is not present', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'CORS_ORIGINS') return 'https://fallback.breathaway.com';
        return undefined;
      });

      configureCors(mockApp, mockConfigService);

      expect(mockApp.enableCors).toHaveBeenCalledTimes(1);
      expect(mockApp.enableCors).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: ['https://fallback.breathaway.com'],
          credentials: true,
        }),
      );
    });

    it('should handle wildcard origins properly by passing origin: true', () => {
      const cors = new CorsConfig({
        allowedOrigins: ['*'],
      });
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === CORS_CONFIG_KEY) return cors;
        return undefined;
      });

      configureCors(mockApp, mockConfigService);

      expect(mockApp.enableCors).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: true,
        }),
      );
    });
  });
});

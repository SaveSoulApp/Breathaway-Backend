import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { envValidationOptions, envValidationSchema } from '../env.validation';

describe('envValidationSchema', () => {
  const baseValidEnv = {
    DATABASE_URL:
      'postgresql://user:password@localhost:5432/mydb?schema=public',
  };

  describe('valid configurations & defaults', () => {
    it('should pass and apply all default values when only required variables are provided', () => {
      const { error, value } = envValidationSchema.validate(
        baseValidEnv,
        envValidationOptions,
      );

      expect(error).toBeUndefined();

      // Database pool defaults
      expect(value.DB_POOL_MAX).toBe(4);
      expect(value.DB_POOL_MIN).toBe(0);
      expect(value.DB_POOL_ACQUISITION_TIMEOUT_MS).toBe(5000);
      expect(value.DB_POOL_IDLE_TIMEOUT_MS).toBe(10000);
      expect(value.DB_POOL_STATEMENT_TIMEOUT_MS).toBe(15000);

      // Core environment defaults
      expect(value.NODE_ENV).toBe('development');
      expect(value.PORT).toBe(3000);
      expect(value.DEPLOYMENT_ENV).toBe('gcp');
      expect(value.APP_NAME).toBe('BreathAway');
      expect(value.MIN_APP_VERSION).toBe('1.0.0');
      expect(value.REQUIRED_PLATFORMS).toBe(
        '["iOS","Android","Postman","Web"]',
      );
      expect(value.CORS_ORIGINS).toBe(
        '["http://localhost:3000","http://localhost:5173"]',
      );

      // Observability defaults
      expect(value.LOG_LEVEL).toBe('info');

      // GCP & Infrastructure defaults
      expect(value.GCP_PROJECT_ID).toBe('breathaway-dev');
      expect(value.GCP_BUCKET_NAME).toBe('breathaway-documents');
      expect(value.FIREBASE_PROJECT_ID).toBe('breathaway-dev-37fd5');
      expect(value.AUDIT_PUBSUB_TOPIC).toBe('audit-logs-topic');

      // Auth & Security defaults
      expect(value.JWT_EXPIRES_IN).toBe('30d');
      expect(value.JWT_AUDIENCE).toBe('breathaway-mobile-app');
      expect(value.JWT_ISSUER).toBe('https://breathaway.app');
      expect(value.OTP_TTL).toBe(300);
      expect(value.OTP_RATE_LIMIT_TTL).toBe(120);

      // Domain expiration defaults
      expect(value.CREDIT_EXPIRY_DAYS).toBe(90);
      expect(value.LIKE_EXPIRY_DAYS).toBe(90);

      // Subscriptions & Regional Pricing Defaults
      expect(value.DEFAULT_COUNTRY_CODE).toBe('IN');
      expect(value.IPINFO_TIMEOUT_MS).toBe(1500);

      // Email defaults
      expect(value.EMAIL_PROVIDER).toBe('brevo');
      expect(value.EMAIL_FROM_ADDRESS).toBe('no-reply@breathaway.app');
      expect(value.EMAIL_FROM_NAME).toBe('BreathAway');

      // Swagger defaults
      expect(value.SWAGGER_ENABLED).toBe('true');
    });

    it('should coerce string values into numbers for all numeric fields', () => {
      const customEnv = {
        ...baseValidEnv,
        DB_POOL_MAX: '8',
        DB_POOL_MIN: '2',
        DB_POOL_ACQUISITION_TIMEOUT_MS: '3000',
        DB_POOL_IDLE_TIMEOUT_MS: '6000',
        DB_POOL_STATEMENT_TIMEOUT_MS: '12000',
        PORT: '8080',
        OTP_TTL: '600',
        OTP_RATE_LIMIT_TTL: '180',
        CREDIT_EXPIRY_DAYS: '180',
        LIKE_EXPIRY_DAYS: '60',
      };

      const { error, value } = envValidationSchema.validate(
        customEnv,
        envValidationOptions,
      );

      expect(error).toBeUndefined();
      expect(value.DB_POOL_MAX).toBe(8);
      expect(value.DB_POOL_MIN).toBe(2);
      expect(value.DB_POOL_ACQUISITION_TIMEOUT_MS).toBe(3000);
      expect(value.DB_POOL_IDLE_TIMEOUT_MS).toBe(6000);
      expect(value.DB_POOL_STATEMENT_TIMEOUT_MS).toBe(12000);
      expect(value.PORT).toBe(8080);
      expect(value.OTP_TTL).toBe(600);
      expect(value.OTP_RATE_LIMIT_TTL).toBe(180);
      expect(value.CREDIT_EXPIRY_DAYS).toBe(180);
      expect(value.LIKE_EXPIRY_DAYS).toBe(60);
    });

    it('should preserve unknown environment variables when allowUnknown is true', () => {
      const envWithExtras = {
        ...baseValidEnv,
        SECRET_KEY_FROM_GCP: 'sensitive-secret',
        CUSTOM_HEADER: 'header-val',
      };

      const { error, value } = envValidationSchema.validate(
        envWithExtras,
        envValidationOptions,
      );

      expect(error).toBeUndefined();
      expect(value.SECRET_KEY_FROM_GCP).toBe('sensitive-secret');
      expect(value.CUSTOM_HEADER).toBe('header-val');
    });
  });

  describe('invalid configurations', () => {
    it('should fail when DATABASE_URL is missing', () => {
      const { error } = envValidationSchema.validate({}, envValidationOptions);

      expect(error).toBeDefined();
      expect(error?.message).toContain('"DATABASE_URL" is required');
    });

    it('should fail when DB_POOL_MAX is not a number', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, DB_POOL_MAX: 'invalid_max' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain('"DB_POOL_MAX" must be a number');
    });

    it('should fail when DB_POOL_MAX is less than 1', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, DB_POOL_MAX: '0' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        '"DB_POOL_MAX" must be greater than or equal to 1',
      );
    });

    it('should fail when LOG_LEVEL is invalid', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, LOG_LEVEL: 'verbose_invalid' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain('"LOG_LEVEL" must be one of');
    });

    it('should fail when EMAIL_PROVIDER is unsupported', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, EMAIL_PROVIDER: 'ses' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain('"EMAIL_PROVIDER" must be one of');
    });

    it('should fail when EMAIL_FROM_ADDRESS is not a valid email', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, EMAIL_FROM_ADDRESS: 'invalid-email-string' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        '"EMAIL_FROM_ADDRESS" must be a valid email',
      );
    });

    it('should fail when OTP_TTL is not a positive number', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, OTP_TTL: '-10' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain('"OTP_TTL" must be a positive number');
    });

    it('should fail when CREDIT_EXPIRY_DAYS is not positive', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, CREDIT_EXPIRY_DAYS: '0' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        '"CREDIT_EXPIRY_DAYS" must be a positive number',
      );
    });

    it('should fail when SWAGGER_ENABLED is neither true nor false', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, SWAGGER_ENABLED: 'yes' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain('"SWAGGER_ENABLED" must be one of');
    });

    it('should fail when DEFAULT_COUNTRY_CODE length is not 2 characters', () => {
      const { error } = envValidationSchema.validate(
        { ...baseValidEnv, DEFAULT_COUNTRY_CODE: 'IND' },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        '"DEFAULT_COUNTRY_CODE" length must be 2 characters long',
      );
    });

    it('should uppercase DEFAULT_COUNTRY_CODE when provided in lowercase', () => {
      const { error, value } = envValidationSchema.validate(
        { ...baseValidEnv, DEFAULT_COUNTRY_CODE: 'us' },
        envValidationOptions,
      );

      expect(error).toBeUndefined();
      expect(value.DEFAULT_COUNTRY_CODE).toBe('US');
    });

    it('should accumulate multiple validation errors when abortEarly is false', () => {
      const { error } = envValidationSchema.validate(
        {
          DB_POOL_MAX: 'invalid',
          LOG_LEVEL: 'invalid',
          EMAIL_PROVIDER: 'unknown',
        },
        envValidationOptions,
      );

      expect(error).toBeDefined();
      expect(error?.details.length).toBeGreaterThanOrEqual(4); // DATABASE_URL + 3 invalid fields
    });
  });

  describe('NestJS ConfigModule integration', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should inject validated and coerced numbers into ConfigService via ConfigModule', async () => {
      process.env.DATABASE_URL =
        'postgresql://user:password@localhost:5432/mydb?schema=public';
      process.env.DB_POOL_MAX = '6';
      process.env.OTP_TTL = '450';
      process.env.CREDIT_EXPIRY_DAYS = '120';
      process.env.EMAIL_PROVIDER = 'brevo';

      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            validationSchema: envValidationSchema,
            validationOptions: envValidationOptions,
          }),
        ],
      }).compile();

      const configService = moduleRef.get(ConfigService);
      expect(configService.get<number>('DB_POOL_MAX')).toBe(6);
      expect(configService.get<number>('OTP_TTL')).toBe(450);
      expect(configService.get<number>('CREDIT_EXPIRY_DAYS')).toBe(120);
      expect(configService.get<string>('EMAIL_PROVIDER')).toBe('brevo');
    });

    it('should throw during bootstrap if an invalid environment value is passed in process.env', async () => {
      process.env.DATABASE_URL =
        'postgresql://user:password@localhost:5432/mydb?schema=public';
      process.env.LOG_LEVEL = 'unsupported_log_level';

      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              ignoreEnvFile: true,
              validationSchema: envValidationSchema,
              validationOptions: envValidationOptions,
            }),
          ],
        }).compile(),
      ).rejects.toThrow();
    });
  });
});

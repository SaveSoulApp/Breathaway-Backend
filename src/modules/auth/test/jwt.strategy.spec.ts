import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        JWT_SECRET: 'test-secret-key',
        JWT_AUDIENCE: 'test-audience',
        JWT_ISSUER: 'test-issuer',
        APP_NAME: 'BreathAway',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user object with userId and email', async () => {
      const payload = {
        sub: '123',
        email: 'test@example.com',
        iss: 'test-issuer',
        aud: 'test-audience',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 123,
        email: 'test@example.com',
      });
    });

    it('should parse userId as integer from sub claim', async () => {
      const payload = {
        sub: '456',
        email: 'user@example.com',
      };

      const result = await strategy.validate(payload);

      expect(result.userId).toBe(456);
      expect(typeof result.userId).toBe('number');
    });

    it('should handle payload without email', async () => {
      const payload = {
        sub: '789',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 789,
        email: undefined,
      });
    });

    it('should handle numeric sub claim', async () => {
      const payload = {
        sub: 999,
        email: 'numeric@example.com',
      };

      const result = await strategy.validate(payload);

      expect(result.userId).toBe(999);
      expect(typeof result.userId).toBe('number');
    });
  });
});

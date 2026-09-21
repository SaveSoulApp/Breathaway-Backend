import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';

import { SupabaseAuthService } from '../services/supabase-auth.service';

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;
  let configService: ConfigService;
  let jwtService: JwtService;

  const contextualLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
    verbose: jest.fn(),
  };

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue(contextualLogger),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseAuthService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SupabaseAuthService>(SupabaseAuthService);
    configService = module.get<ConfigService>(ConfigService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a token with kid header and aud claim when key ID and private key are configured', () => {
      // Arrange
      const mockPrivateKey =
        '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
      const mockKeyId = 'supabase-key-id-123';
      const mockUserId = 'user-123';
      const mockToken = 'jwt-token-with-kid';

      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SUPABASE_JWT_PRIVATE_KEY') return mockPrivateKey;
        if (key === 'SUPABASE_JWT_KEY_ID') return mockKeyId;
        return undefined;
      });
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      // Act
      const result = service.generateToken(mockUserId);

      // Assert
      expect(configService.get).toHaveBeenCalledWith(
        'SUPABASE_JWT_PRIVATE_KEY',
      );
      expect(configService.get).toHaveBeenCalledWith('SUPABASE_JWT_KEY_ID');
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUserId,
          role: 'authenticated',
          aud: 'authenticated',
        },
        {
          secret: mockPrivateKey.replace(/\\n/g, '\n'),
          algorithm: 'ES256',
          expiresIn: '1h',
          keyid: mockKeyId,
        },
      );
      expect(result).toBe(mockToken);
      expect(contextualLogger.warn).not.toHaveBeenCalled();
    });

    it('should generate a token without kid header and log warning when key ID is missing', () => {
      // Arrange
      const mockPrivateKey =
        '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
      const mockUserId = 'user-123';
      const mockToken = 'jwt-token-without-kid';

      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SUPABASE_JWT_PRIVATE_KEY') return mockPrivateKey;
        if (key === 'SUPABASE_JWT_KEY_ID') return undefined;
        return undefined;
      });
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      // Act
      const result = service.generateToken(mockUserId);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUserId,
          role: 'authenticated',
          aud: 'authenticated',
        },
        {
          secret: mockPrivateKey.replace(/\\n/g, '\n'),
          algorithm: 'ES256',
          expiresIn: '1h',
        },
      );
      expect(result).toBe(mockToken);
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SUPABASE_JWT_KEY_ID is missing'),
        { step: 'generate_token' },
      );
    });

    it('should throw an InternalServerErrorException if private key is missing', () => {
      // Arrange
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      // Act & Assert
      expect(() => service.generateToken('user-123')).toThrow(
        InternalServerErrorException,
      );
    });
  });
});

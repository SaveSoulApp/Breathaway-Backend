import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InternalServerErrorException } from '@nestjs/common';
import { SupabaseAuthService } from '../services/supabase-auth.service';

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;
  let configService: ConfigService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseAuthService,
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

  describe('generateToken', () => {
    it('should generate a token when secret is configured', () => {
      const mockSecret = 'super-secret';
      const mockUserId = 'user-123';
      const mockToken = 'jwt-token';

      jest.spyOn(configService, 'get').mockReturnValue(mockSecret);
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      const result = service.generateToken(mockUserId);

      expect(configService.get).toHaveBeenCalledWith('SUPABASE_JWT_SECRET');
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUserId,
          role: 'authenticated',
        },
        {
          secret: mockSecret,
          expiresIn: '1h',
        },
      );
      expect(result).toBe(mockToken);
    });

    it('should throw an InternalServerErrorException if secret is missing', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      expect(() => service.generateToken('user-123')).toThrow(
        InternalServerErrorException,
      );
    });
  });
});

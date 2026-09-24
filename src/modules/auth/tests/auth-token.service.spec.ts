jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { LoggerService } from '@core/logger';
import { AuditActionType } from '@modules/audit/dto';

import { AuthTokenService } from '../services/auth-token.service';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const mockUser: User = {
    id: 'user-auth-123',
    countryCode: 'US',
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    event: jest.fn(),
  };

  beforeEach(async () => {
    jwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token') };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ISSUER') return 'breathaway-issuer';
        if (key === 'JWT_AUDIENCE') return 'breathaway-client';
        return undefined;
      }),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        {
          provide: LoggerService,
          useValue: { forContext: jest.fn().mockReturnValue(mockLogger) },
        },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAuthResponse', () => {
    it('should generate signed token and emit user login audit log without metadata', () => {
      // Act
      const result = service.generateAuthResponse(mockUser);

      // Assert
      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        user_id: 'user-auth-123',
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-auth-123',
          iss: 'breathaway-issuer',
          aud: 'breathaway-client',
          jti: expect.any(String),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGIN,
          userId: 'user-auth-123',
        }),
      );
    });

    it('should include metadata in audit log when provided', () => {
      // Arrange
      const metadata = { ip: '1.2.3.4', platform: 'iOS' };

      // Act
      const result = service.generateAuthResponse(mockUser, metadata);

      // Assert
      expect(result.access_token).toBe('mock-jwt-token');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actionType: AuditActionType.USER_LOGIN,
          userId: 'user-auth-123',
          metadata,
        }),
      );
    });
  });
});

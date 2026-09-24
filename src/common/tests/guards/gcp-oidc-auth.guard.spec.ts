import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';

import { LoggerService } from '@core/logger';

import { GcpOidcAuthGuard } from '../../guards/gcp-oidc-auth.guard';
import { createMockExecutionContext } from '../mocks/execution-context.mock';

describe(GcpOidcAuthGuard.name, () => {
  let guard: GcpOidcAuthGuard;
  let configService: jest.Mocked<ConfigService>;
  let contextualLogger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };
  let loggerService: {
    forContext: jest.Mock;
  };

  const mockAudience = 'https://backend-service-at7g3x4m6q-el.a.run.app';

  beforeEach(async () => {
    contextualLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    loggerService = {
      forContext: jest.fn().mockReturnValue(contextualLogger),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcpOidcAuthGuard,
        { provide: LoggerService, useValue: loggerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<GcpOidcAuthGuard>(GcpOidcAuthGuard);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      const context = createMockExecutionContext({
        headers: {},
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid or missing Bearer token'),
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Missing or invalid Authorization header format',
        { step: 'authenticate' },
      );
    });

    it('should throw UnauthorizedException when Authorization header does not start with Bearer', async () => {
      const context = createMockExecutionContext({
        headers: {
          authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid or missing Bearer token'),
      );
      expect(contextualLogger.warn).toHaveBeenCalledWith(
        'Missing or invalid Authorization header format',
        { step: 'authenticate' },
      );
    });

    it('should throw UnauthorizedException when GCP_OIDC_AUDIENCE is not set', async () => {
      configService.get.mockReturnValue(undefined);

      const context = createMockExecutionContext({
        headers: {
          authorization: 'Bearer valid-jwt-token',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Server configuration error'),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'GCP_OIDC_AUDIENCE environment variable is not set',
        { step: 'authenticate' },
      );
    });

    it('should throw UnauthorizedException when token verification fails', async () => {
      configService.get.mockReturnValue(mockAudience);

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockRejectedValue(new Error('Signature verification failed'));

      const context = createMockExecutionContext({
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid OIDC token'),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'OIDC verification failed',
        expect.objectContaining({ step: 'authenticate' }),
      );
    });

    it('should throw UnauthorizedException when token payload is missing', async () => {
      configService.get.mockReturnValue(mockAudience);

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue(null),
      } as unknown as LoginTicket;

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(mockTicket);

      const context = createMockExecutionContext({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid OIDC token'),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'OIDC verification failed',
        expect.objectContaining({ step: 'authenticate' }),
      );
    });

    it('should throw UnauthorizedException when token issuer is not Google accounts', async () => {
      configService.get.mockReturnValue(mockAudience);

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue({
          iss: 'https://attacker.example.com',
          aud: mockAudience,
        }),
      } as unknown as LoginTicket;

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(mockTicket);

      const context = createMockExecutionContext({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid OIDC token'),
      );
      expect(contextualLogger.error).toHaveBeenCalledWith(
        'OIDC verification failed',
        expect.objectContaining({ step: 'authenticate' }),
      );
    });

    it('should return true and attach oidcPayload when token is valid with https://accounts.google.com issuer', async () => {
      configService.get.mockReturnValue(mockAudience);

      const mockPayload: Partial<TokenPayload> = {
        iss: 'https://accounts.google.com',
        aud: mockAudience,
        email: 'pubsub-invoker@breathaway-dev.iam.gserviceaccount.com',
        email_verified: true,
      };

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue(mockPayload),
      } as unknown as LoginTicket;

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(mockTicket);

      const req: Record<string, unknown> = {
        headers: {
          authorization: 'Bearer valid-oidc-jwt',
        },
      };

      const context = createMockExecutionContext(req);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req.oidcPayload).toEqual(mockPayload);
      expect(OAuth2Client.prototype.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-oidc-jwt',
        audience: mockAudience,
      });
    });

    it('should return true when token is valid with accounts.google.com issuer', async () => {
      configService.get.mockReturnValue(mockAudience);

      const mockPayload: Partial<TokenPayload> = {
        iss: 'accounts.google.com',
        aud: mockAudience,
        email: 'scheduler-invoker@breathaway-dev.iam.gserviceaccount.com',
        email_verified: true,
      };

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue(mockPayload),
      } as unknown as LoginTicket;

      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(mockTicket);

      const req: Record<string, unknown> = {
        headers: {
          authorization: 'Bearer valid-oidc-jwt',
        },
      };

      const context = createMockExecutionContext(req);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req.oidcPayload).toEqual(mockPayload);
    });
  });
});

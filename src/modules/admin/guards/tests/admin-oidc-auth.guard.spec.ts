import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { createMockExecutionContext } from '@common/tests/mocks/execution-context.mock';
import { LoggerService } from '@core/logger';

import { AdminOidcAuthGuard } from '../admin-oidc-auth.guard';

describe('AdminOidcAuthGuard', () => {
  let guard: AdminOidcAuthGuard;
  let clsService: jest.Mocked<ClsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  const defaultUserEmail = 'developer@company.com';
  const defaultUserSub = 'google-sub-12345';

  beforeEach(async () => {
    clsService = {
      set: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<ClsService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'GCP_ADMIN_OIDC_AUDIENCE')
          return 'https://api.breathaway.com';
        if (key === 'GCP_PROJECT_ID') return 'test-gcp-project';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOidcAuthGuard,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: configService },
        { provide: ClsService, useValue: clsService },
      ],
    }).compile();

    guard = module.get<AdminOidcAuthGuard>(AdminOidcAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
    guard.clearIamCache();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('Token validation', () => {
    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      const context = createMockExecutionContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when header does not start with Bearer', async () => {
      const context = createMockExecutionContext({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when Bearer token is whitespace', async () => {
      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer   ' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when Google verifyIdToken throws', async () => {
      jest
        .spyOn(guard['oAuth2Client'] as any, 'verifyIdToken')
        .mockRejectedValue(new Error('Token expired'));

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer expired.token.jwt' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token issuer is invalid', async () => {
      jest
        .spyOn(guard['oAuth2Client'] as any, 'verifyIdToken')
        .mockResolvedValue({
          getPayload: () =>
            ({
              iss: 'https://evil-issuer.com',
              email: defaultUserEmail,
              email_verified: true,
              sub: defaultUserSub,
            }) as any,
        } as any);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer valid.looking.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when email is unverified', async () => {
      jest
        .spyOn(guard['oAuth2Client'] as any, 'verifyIdToken')
        .mockResolvedValue({
          getPayload: () =>
            ({
              iss: 'https://accounts.google.com',
              email: defaultUserEmail,
              email_verified: false,
              sub: defaultUserSub,
            }) as any,
        } as any);

      const context = createMockExecutionContext({
        headers: { authorization: 'Bearer unverified.email.token' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Authorization checks', () => {
    beforeEach(() => {
      jest
        .spyOn(guard['oAuth2Client'] as any, 'verifyIdToken')
        .mockResolvedValue({
          getPayload: () =>
            ({
              iss: 'https://accounts.google.com',
              email: defaultUserEmail,
              email_verified: true,
              sub: defaultUserSub,
            }) as any,
        } as any);
    });

    it('should authorize successfully when email matches ADMIN_ALLOWED_EMAILS', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ADMIN_ALLOWED_EMAILS')
          return 'other@company.com, developer@company.com';
        if (key === 'GCP_ADMIN_OIDC_AUDIENCE')
          return 'https://api.breathaway.com';
        return undefined;
      });

      const req: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/users/123',
        method: 'DELETE',
      };
      const context = createMockExecutionContext(req);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(clsService.set).toHaveBeenCalledWith(
        'adminEmail',
        defaultUserEmail,
      );
      expect(clsService.set).toHaveBeenCalledWith('adminSub', defaultUserSub);
      expect(req.adminUser).toEqual(
        expect.objectContaining({
          email: defaultUserEmail,
          sub: defaultUserSub,
        }),
      );
    });

    it('should authorize successfully via GCP Cloud Resource Manager IAM policy', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        data: {
          bindings: [
            {
              role: 'roles/owner',
              members: [`user:${defaultUserEmail}`],
            },
          ],
        },
      });

      jest.spyOn(guard['googleAuth'], 'getClient').mockResolvedValue({
        request: mockRequest,
      } as any);

      const req: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/credits/grant',
        method: 'POST',
      };
      const context = createMockExecutionContext(req);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(clsService.set).toHaveBeenCalledWith(
        'adminEmail',
        defaultUserEmail,
      );
    });

    it('should use cached IAM emails and not call GCP API again within TTL', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        data: {
          bindings: [
            {
              role: 'roles/editor',
              members: [`user:${defaultUserEmail}`],
            },
          ],
        },
      });

      jest.spyOn(guard['googleAuth'], 'getClient').mockResolvedValue({
        request: mockRequest,
      } as any);

      const req: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/reports',
        method: 'GET',
      };
      const context = createMockExecutionContext(req);

      // First call
      await guard.canActivate(context);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Second call within TTL
      await guard.canActivate(context);
      expect(mockRequest).toHaveBeenCalledTimes(1); // Still 1, verified cache was hit!
    });

    it('should throw ForbiddenException when user is not present in IAM policy', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        data: {
          bindings: [
            {
              role: 'roles/owner',
              members: ['user:someone.else@company.com'],
            },
          ],
        },
      });

      jest.spyOn(guard['googleAuth'], 'getClient').mockResolvedValue({
        request: mockRequest,
      } as any);

      const req: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/users/123',
        method: 'DELETE',
      };
      const context = createMockExecutionContext(req);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should authorize serviceAccount members discovered in IAM policy', async () => {
      const saEmail = 'service-runner@test-gcp-project.iam.gserviceaccount.com';

      jest
        .spyOn(guard['oAuth2Client'] as any, 'verifyIdToken')
        .mockResolvedValue({
          getPayload: () => ({
            iss: 'https://accounts.google.com',
            email: saEmail,
            email_verified: true,
            sub: 'sa-sub-999',
            aud: 'https://api.breathaway.com',
          }),
        });

      const mockRequest = jest.fn().mockResolvedValue({
        data: {
          bindings: [
            {
              role: 'roles/editor',
              members: [`serviceAccount:${saEmail}`],
            },
          ],
        },
      });

      jest.spyOn(guard['googleAuth'], 'getClient').mockResolvedValue({
        request: mockRequest,
      } as any);

      const req: any = {
        headers: { authorization: 'Bearer valid.sa.token' },
        originalUrl: '/v1/admin/transactions',
        method: 'GET',
      };
      const context = createMockExecutionContext(req);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(clsService.set).toHaveBeenCalledWith('adminEmail', saEmail);
    });

    it('should deduplicate concurrent in-flight IAM policy fetches (singleflight)', async () => {
      let resolveFetch!: (val: any) => void;
      const fetchPromise = new Promise((res) => {
        resolveFetch = res;
      });

      const mockRequest = jest.fn().mockImplementation(() => fetchPromise);

      jest.spyOn(guard['googleAuth'], 'getClient').mockResolvedValue({
        request: mockRequest,
      } as any);

      const req1: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/users',
        method: 'GET',
      };
      const req2: any = {
        headers: { authorization: 'Bearer valid.google.token' },
        originalUrl: '/v1/admin/reports',
        method: 'GET',
      };

      const ctx1 = createMockExecutionContext(req1);
      const ctx2 = createMockExecutionContext(req2);

      // Launch both concurrently
      const call1 = guard.canActivate(ctx1);
      const call2 = guard.canActivate(ctx2);

      // Resolve the single mock request
      resolveFetch({
        data: {
          bindings: [
            {
              role: 'roles/owner',
              members: [`user:${defaultUserEmail}`],
            },
          ],
        },
      });

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(res1).toBe(true);
      expect(res2).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });
});

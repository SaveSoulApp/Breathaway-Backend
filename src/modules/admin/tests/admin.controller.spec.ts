jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-id',
}));

import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';

import { LoggerService } from '@core/logger';
import { AuthService } from '@modules/auth/auth.service';
import { AUTH_DEV_LOGIN_THROTTLE } from '@modules/auth/constants';
import { DevLoginRequestDto } from '@modules/auth/dto';
import { CreditsService } from '@modules/credits/credits.service';
import { ConsumeCreditsRequestDto } from '@modules/credits/dto';

import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';
import { AdminOidcAuthGuard } from '../guards/admin-oidc-auth.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;
  let creditsService: jest.Mocked<CreditsService>;
  let authService: jest.Mocked<AuthService>;
  let reflector: Reflector;

  const mockLoggerService = {
    forContext: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const mockAdminService = {
      deleteAccount: jest.fn(),
    };

    const mockCreditsService = {
      grantCredits: jest.fn(),
      consumeCredits: jest.fn(),
    };

    const mockAuthService = {
      devLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        Reflector,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: AdminService, useValue: mockAdminService },
        { provide: CreditsService, useValue: mockCreditsService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    })
      .overrideGuard(AdminOidcAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);
    creditsService = module.get(CreditsService);
    authService = module.get(AuthService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteAccount', () => {
    it('should call adminService.deleteAccount and return void', async () => {
      // Arrange
      adminService.deleteAccount.mockResolvedValue(undefined);

      // Act
      await controller.deleteAccount('user-1', { reason: 'Violated terms' });

      // Assert
      expect(adminService.deleteAccount).toHaveBeenCalledWith(
        'user-1',
        'Violated terms',
      );
    });
  });

  describe('grantCredits', () => {
    it('should call creditsService.grantCredits with dto, undefined, no tx, and timezone from req', async () => {
      // Arrange
      const mockLedgerEntry = { id: 'entry-1', amount: 100 } as any;
      creditsService.grantCredits.mockResolvedValue(mockLedgerEntry);

      const dto = {
        userId: 'user-1',
        amount: 100,
        source: 'ADMIN_GRANT' as any,
      };

      // The controller reads timezone from req (attached by TimezoneMiddleware).

      // Act
      const result = await controller.grantCredits(dto);

      // Assert
      expect(creditsService.grantCredits).toHaveBeenCalledWith(dto, undefined);
      expect(result).toEqual(mockLedgerEntry);
    });
  });

  describe('consumeCredits', () => {
    it('should call creditsService.consumeCredits with dto and return debit ledger entry', async () => {
      // Arrange
      const mockLedgerEntry = { id: 'entry-2', amount: 20 } as any;
      creditsService.consumeCredits.mockResolvedValue(mockLedgerEntry);

      const dto: ConsumeCreditsRequestDto = {
        userId: 'user-1',
        amount: 20,
        referenceId: 'like-ref-123',
      };

      // Act
      const result = await controller.consumeCredits(dto);

      // Assert
      expect(creditsService.consumeCredits).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockLedgerEntry);
    });
  });

  describe('devLogin', () => {
    it('should invoke authService.devLogin with developer credentials and metadata', async () => {
      // Arrange
      const dto: DevLoginRequestDto = { identifier: 'dev@breathaway.test' };
      const mockDevResponse = {
        userId: 'dev-user-1',
        tokenType: 'Bearer',
        accessToken: 'mock-access-token',
        expiresIn: 900,
        refreshToken: 'mock-refresh-token',
        refreshTokenExpiresAt: '2026-10-18T00:00:00.000Z',
      };
      authService.devLogin.mockResolvedValue(mockDevResponse);

      // Act
      const result = await controller.devLogin(
        dto,
        '127.0.0.1',
        'DevClient',
        'device-dev-1',
      );

      // Assert
      expect(authService.devLogin).toHaveBeenCalledWith(dto, {
        ipAddress: '127.0.0.1',
        userAgent: 'DevClient',
        deviceId: 'device-dev-1',
      });
      expect(result).toEqual(mockDevResponse);
    });

    it('should attach dev-login throttling metadata to /dev-login', () => {
      // Act
      const shortLimit = reflector.get(
        THROTTLER_LIMIT + 'short',
        controller.devLogin,
      );
      const longLimit = reflector.get(
        THROTTLER_LIMIT + 'long',
        controller.devLogin,
      );

      // Assert
      expect(shortLimit).toBe(AUTH_DEV_LOGIN_THROTTLE.short.limit);
      expect(longLimit).toBe(AUTH_DEV_LOGIN_THROTTLE.long.limit);
    });
  });
});
